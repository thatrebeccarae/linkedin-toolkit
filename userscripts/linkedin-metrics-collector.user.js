// ==UserScript==
// @name         LinkedIn Metrics Collector
// @namespace    https://rebeccaraebarton.com
// @version      2.3.0
// @description  Passively intercepts LinkedIn analytics API responses, stores locally, and optionally pushes to a user-configurable webhook. GDPR Art. 20 data portability — own data only.
// @author       Rebecca Rae Barton
// @match        https://www.linkedin.com/analytics/*
// @match        https://www.linkedin.com/feed/update/*/analytics/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      *
// @run-at       document-start
// ==/UserScript==

// Dual-layer approach:
// - GM_xmlhttpRequest: bypasses CORS/CSP to POST metrics to a user-configured webhook
// - unsafeWindow: accesses page-context fetch/XHR for Voyager API interception
//
// Setup (optional remote sync):
//   Open Tampermonkey dashboard → this script → Storage tab → add key
//     LI_METRICS_WEBHOOK_URL  =  https://your-webhook-endpoint.example/path
//   If unset, metrics are still captured to localStorage and can be exported
//   via the "Export Metrics JSON" button.
//
// Compatible receivers: any endpoint that accepts POST with
// Content-Type: application/json and the payload shape
// { source, version, collectedAt, postCount, posts: [...] }.
// Suggested patterns: a small FastAPI/Flask/Express endpoint that appends
// each batch as one JSONL line, or a workflow tool's HTTP webhook trigger.
// If your receiver requires auth, embed the token as a query string in
// LI_METRICS_WEBHOOK_URL (this script's POST surface doesn't expose
// custom headers).

(function () {
  'use strict';

  const STORAGE_KEY = 'li_metrics_collected';
  const VERSION = '2.3.0';
  const WEBHOOK_URL = (typeof GM_getValue === 'function')
    ? GM_getValue('LI_METRICS_WEBHOOK_URL', '')
    : '';

  // ── Metrics buffer ─────────────────────────────────────────────────
  let metricsBatch = {};
  let batchTimer = null;
  const BATCH_DELAY = 3000;
  let warnedUnconfigured = false;

  // ── Parsers ────────────────────────────────────────────────────────

  function parseAnalyticsView(data) {
    const posts = {};
    try {
      const included = data?.included || [];
      for (const item of included) {
        const type = item?.$type || '';
        if (type.includes('edgeInsightsAnalyticsCard') || type.includes('LibraCard')) {
          const urn = item?.entityUrn || '';
          const activityMatch = urn.match(/urn:li:activity:(\d+)/);
          if (!activityMatch) continue;
          const activityId = activityMatch[1];
          if (!posts[activityId]) posts[activityId] = { activityId };

          const components = item?.components || [];
          for (const comp of components) {
            const leia = comp?.leiaComponent;
            if (!leia) continue;

            const keyItems = leia?.summary?.keyMetrics?.items || [];
            for (const ki of keyItems) {
              const name = normalizeMetric(ki?.description?.text);
              const value = parseNum(ki?.title?.text);
              if (name && value != null) posts[activityId][name] = value;
            }

            const listItems = leia?.analyticsObjectList?.items || [];
            for (const li of listItems) {
              const cta = li?.content?.analyticsMiniUpdateItem?.ctaItem;
              if (!cta) continue;
              if (cta.title && cta.controlName === 'analytics_navigate_deeplink') {
                const miniUrn = li?.content?.analyticsMiniUpdateItem?.['*miniUpdate'] || '';
                const m = miniUrn.match(/urn:li:activity:(\d+)/);
                if (m) {
                  const pid = m[1];
                  if (!posts[pid]) posts[pid] = { activityId: pid };
                  posts[pid].impressions = parseNum(cta.title);
                }
              }
              if (cta.primaryTitle) {
                const name = normalizeMetric(cta.primaryTitle);
                const value = parseNum(cta.primaryText?.text);
                if (name && value != null) posts[activityId][name] = value;
              }
            }
          }
        }
      }
    } catch (e) { /* silent */ }
    return posts;
  }

  function parseLibraView(data) {
    const posts = {};
    try {
      const included = data?.included || [];
      for (const item of included) {
        const type = item?.$type || '';

        if (type.includes('SocialActivityCounts')) {
          const urn = item?.urn || item?.entityUrn || '';
          const m = urn.match(/urn:li:activity:(\d+)/);
          if (!m) continue;
          const id = m[1];
          if (!posts[id]) posts[id] = { activityId: id };
          posts[id].reactions = item.numLikes ?? null;
          posts[id].comments = item.numComments ?? null;
          posts[id].shares = item.numShares ?? null;
          if (item.reactionTypeCounts?.length) {
            posts[id].reactionBreakdown = {};
            for (const r of item.reactionTypeCounts) {
              posts[id].reactionBreakdown[r.reactionType.toLowerCase()] = r.count;
            }
          }
        }

        if (type.includes('MiniUpdate')) {
          const urn = item?.metadata?.backendUrn || '';
          const m = urn.match(/urn:li:activity:(\d+)/);
          if (!m) continue;
          const id = m[1];
          if (!posts[id]) posts[id] = { activityId: id };
          posts[id].contextDescription = item?.contextualDescription?.text?.text || '';
          const target = item?.contextualDescription?.navigationContext?.target || '';
          if (target) posts[id].postUrl = target.split('?')[0];
        }

        if (type.includes('LibraCard')) {
          const components = item?.components || [];
          for (const comp of components) {
            const leia = comp?.leiaComponent;
            if (!leia) continue;

            const keyItems = leia?.summary?.keyMetrics?.items || [];
            for (const ki of keyItems) {
              if (ki?.description?.text?.toLowerCase() === 'impressions') {
                metricsBatch._summary = metricsBatch._summary || {};
                metricsBatch._summary.totalImpressions = parseNum(ki?.title?.text);
                metricsBatch._summary.impressionsPctChange = ki?.valuePercentageChange;
                metricsBatch._summary.timeRange = ki?.valuePercentageDescription || '';
              }
            }

            const listItems = leia?.analyticsObjectList?.items || [];
            for (const li of listItems) {
              const cta = li?.content?.analyticsMiniUpdateItem?.ctaItem;
              const miniUrn = li?.content?.analyticsMiniUpdateItem?.['*miniUpdate'] || '';
              const m = miniUrn.match(/urn:li:activity:(\d+)/);
              if (m && cta?.title) {
                const pid = m[1];
                if (!posts[pid]) posts[pid] = { activityId: pid };
                posts[pid].impressions = parseNum(cta.title);
              }
            }
          }
        }
      }
    } catch (e) { /* silent */ }
    return posts;
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  function normalizeMetric(name) {
    if (!name) return null;
    const map = {
      'impressions': 'impressions', 'members reached': 'membersReached',
      'reactions': 'reactions', 'comments': 'comments',
      'reposts': 'shares', 'shares': 'shares',
      'engagements': 'engagements', 'profile views': 'profileViews',
      'link clicks': 'linkClicks', 'follows': 'follows',
    };
    return map[name.toLowerCase().trim()] || name.toLowerCase().trim().replace(/\s+/g, '_');
  }

  function parseNum(str) {
    if (str == null) return null;
    const n = Number(String(str).replace(/,/g, '').trim());
    return isNaN(n) ? str : n;
  }

  // ── Buffer + Store ─────────────────────────────────────────────────

  function mergeIntoBuffer(posts) {
    for (const [id, data] of Object.entries(posts)) {
      if (!metricsBatch[id]) metricsBatch[id] = { activityId: id };
      for (const [k, v] of Object.entries(data)) {
        if (v != null) metricsBatch[id][k] = v;
      }
    }
    clearTimeout(batchTimer);
    batchTimer = setTimeout(saveBatch, BATCH_DELAY);
  }

  function saveBatch() {
    const posts = Object.values(metricsBatch).filter(p => p.activityId && p.activityId !== '_summary');
    const summary = metricsBatch._summary || null;

    if (posts.length === 0) return;

    const payload = {
      source: 'linkedin-metrics-userscript',
      version: VERSION,
      collectedAt: new Date().toISOString(),
      pageUrl: unsafeWindow.location.href,
      summary,
      posts,
    };

    // Save to localStorage (always, regardless of webhook config)
    try {
      const storage = unsafeWindow.localStorage;
      const history = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
      history.push(payload);
      if (history.length > 50) history.splice(0, history.length - 50);
      storage.setItem(STORAGE_KEY, JSON.stringify(history));
      console.log('[LI-Metrics] Saved', posts.length, 'posts to localStorage');
    } catch (e) {
      console.warn('[LI-Metrics] localStorage save failed:', e.message);
    }

    // Push to webhook if configured
    if (WEBHOOK_URL) {
      pushToWebhook(payload);
    } else {
      if (!warnedUnconfigured) {
        console.info('[LI-Metrics] Webhook URL not configured. Set Tampermonkey storage key LI_METRICS_WEBHOOK_URL to enable remote sync. Local capture + export still work.');
        warnedUnconfigured = true;
      }
      showIndicator(posts.length, true, 'local-only');
    }

    metricsBatch = {};
  }

  // ── Webhook Push ────────────────────────────────────────────────────

  function pushToWebhook(payload) {
    try {
      GM_xmlhttpRequest({
        method: 'POST',
        url: WEBHOOK_URL,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(payload),
        timeout: 10000,
        onload: function (response) {
          if (response.status >= 200 && response.status < 300) {
            console.log('[LI-Metrics] Pushed to webhook:', response.responseText);
            showIndicator(payload.posts.length, true, 'synced');
          } else {
            console.warn('[LI-Metrics] Webhook push failed:', response.status, response.responseText);
            showIndicator(payload.posts.length, true, 'local-only');
          }
        },
        onerror: function (err) {
          console.warn('[LI-Metrics] Webhook push error:', err);
          showIndicator(payload.posts.length, true, 'local-only');
        },
        ontimeout: function () {
          console.warn('[LI-Metrics] Webhook push timed out');
          showIndicator(payload.posts.length, true, 'local-only');
        },
      });
    } catch (e) {
      console.warn('[LI-Metrics] GM_xmlhttpRequest unavailable:', e.message);
      showIndicator(payload.posts.length, true, 'local-only');
    }
  }

  // ── Visual indicator ───────────────────────────────────────────────

  function showIndicator(count, saved, syncStatus) {
    const existing = document.getElementById('li-metrics-indicator');
    if (existing) existing.remove();

    const colors = {
      'synced': '#057642',
      'local-only': '#b45309',
      'failed': '#cc1016',
    };
    const labels = {
      'synced': `Synced ${count} post${count !== 1 ? 's' : ''} to webhook`,
      'local-only': `Saved ${count} post${count !== 1 ? 's' : ''} locally (webhook unset or unreachable)`,
      'failed': `Failed to save ${count} post${count !== 1 ? 's' : ''}`,
    };

    const el = document.createElement('div');
    el.id = 'li-metrics-indicator';
    el.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 99999;
      padding: 10px 16px; border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px; font-weight: 500;
      color: white; cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      transition: opacity 0.3s;
      background: ${colors[syncStatus] || colors.failed};
    `;
    el.textContent = labels[syncStatus] || labels.failed;
    el.onclick = () => el.remove();
    document.body.appendChild(el);
    setTimeout(() => { if (el.parentNode) { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); } }, 5000);
  }

  // ── Export button ──────────────────────────────────────────────────

  function injectExportButton() {
    const observer = new MutationObserver(() => {
      if (document.getElementById('li-metrics-export')) return;
      const btn = document.createElement('button');
      btn.id = 'li-metrics-export';
      btn.textContent = 'Export Metrics JSON';
      btn.style.cssText = `
        position: fixed; bottom: 60px; right: 20px; z-index: 99999;
        padding: 8px 14px; border-radius: 6px; border: none;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 12px; font-weight: 600;
        color: white; background: #0a66c2; cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
      `;
      btn.onclick = exportMetrics;
      document.body.appendChild(btn);
      observer.disconnect();
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  function exportMetrics() {
    const data = unsafeWindow.localStorage.getItem(STORAGE_KEY);
    if (!data || data === '[]') {
      alert('No metrics collected yet. Navigate the analytics page and change the time range to capture data.');
      return;
    }
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linkedin-metrics-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── FETCH INTERCEPTOR ──────────────────────────────────────────────

  const _originalFetch = unsafeWindow.fetch;
  unsafeWindow.fetch = function (...args) {
    const fetchPromise = _originalFetch.apply(this, args);

    try {
      const url = (args[0]?.url || args[0] || '').toString();

      if (url.includes('/voyager/api/graphql')) {
        fetchPromise.then(response => {
          const clone = response.clone();
          clone.text().then(text => {
            try {
              const data = JSON.parse(text);
              const root = data?.data?.data || data?.data || data;
              if (root?.premiumDashAnalyticsViewByAnalyticsEntity) {
                mergeIntoBuffer(parseAnalyticsView(data));
              }
              if (root?.premiumDashLibraViewByTargetEntity) {
                mergeIntoBuffer(parseLibraView(data));
              }
            } catch (e) { /* not JSON, ignore */ }
          }).catch(() => {});
        }).catch(() => {});
      }
    } catch (e) { /* silent */ }

    return fetchPromise;
  };

  // ── XHR INTERCEPTOR ────────────────────────────────────────────────

  const _origOpen = unsafeWindow.XMLHttpRequest.prototype.open;
  const _origSend = unsafeWindow.XMLHttpRequest.prototype.send;

  unsafeWindow.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._liUrl = url;
    return _origOpen.call(this, method, url, ...rest);
  };

  unsafeWindow.XMLHttpRequest.prototype.send = function (...args) {
    if (this._liUrl && this._liUrl.includes('/voyager/api/graphql')) {
      this.addEventListener('loadend', function () {
        var rawResponse = this.response;
        var textPromise;
        if (rawResponse instanceof Blob) {
          textPromise = rawResponse.text();
        } else {
          textPromise = Promise.resolve(rawResponse?.toString?.() || this.responseText);
        }
        textPromise.then(function (text) {
          try {
            var data = JSON.parse(text);
            var root = data?.data?.data || data?.data || data;
            if (root?.premiumDashAnalyticsViewByAnalyticsEntity) {
              mergeIntoBuffer(parseAnalyticsView(data));
            }
            if (root?.premiumDashLibraViewByTargetEntity) {
              mergeIntoBuffer(parseLibraView(data));
            }
          } catch (e) { /* not JSON, ignore */ }
        }).catch(function () {});
      });
    }
    return _origSend.apply(this, args);
  };

  // ── Init ───────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectExportButton);
  } else {
    injectExportButton();
  }
})();

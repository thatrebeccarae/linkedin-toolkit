<div align="center">

# LinkedIn Toolkit

**Claude Code skills for LinkedIn data analysis and career visualization.** Turn a LinkedIn data export into interactive dashboards, network graphs, and career timelines — all from your terminal.

[![Claude Code](https://img.shields.io/badge/Claude_Code-Skills-cc785c?style=for-the-badge&logo=anthropic&logoColor=white)](https://docs.anthropic.com/en/docs/claude-code)
[![Python](https://img.shields.io/badge/Python_3.9+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![GitHub stars](https://img.shields.io/github/stars/thatrebeccarae/linkedin-toolkit?style=for-the-badge&logo=github&color=181717)](https://github.com/thatrebeccarae/linkedin-toolkit/stargazers)
[![License](https://img.shields.io/badge/License-MIT-0A66C2?style=for-the-badge)](LICENSE)

```bash
git clone https://github.com/thatrebeccarae/linkedin-toolkit.git
```

[Live Demo](https://thatrebeccarae.github.io/linkedin-toolkit/) · [Why I Built This](#why-i-built-this) · [Who This Is For](#who-this-is-for) · [Getting Started](#getting-started) · [Skills](#skills) · [License](#license)

</div>

---

## Why I Built This

LinkedIn gives you a data export, but no tools to make sense of it. You get CSVs full of connections, messages, invitations, and inferences — but no way to see patterns, identify blind spots, or understand how your network actually works.

I wanted to answer questions like: Who should I be talking to more? Is posting actually driving connection growth? Which parts of my network are strongest? LinkedIn's own analytics don't go deep enough, and most third-party tools want your login credentials.

**LinkedIn Toolkit keeps everything local.** Your data never leaves your machine. Claude Code runs the analysis, Python generates the visualizations, and you open the results in your browser. No servers, no accounts, no API keys required.

## Who This Is For

- **Professionals** who want to understand their LinkedIn network beyond surface-level stats
- **Job seekers** who want to identify warm connections at target companies
- **Content creators** who want to know if posting actually drives growth
- **Career changers** who want to visualize their professional evolution
- **Anyone** who requested a LinkedIn data export and has no idea what to do with it

## Getting Started

```bash
git clone https://github.com/thatrebeccarae/linkedin-toolkit.git
cp -r linkedin-toolkit/skills/linkedin-data-viz ~/.claude/skills/
```

Then open Claude Code and say: **"Analyze my LinkedIn data export"**

The skill walks you through a wizard: locating your export, previewing your data, selecting a theme, and generating visualizations. No configuration needed.

<details>
<summary><strong>Don't have a LinkedIn data export yet?</strong></summary>

1. Go to [LinkedIn Settings > Data Privacy](https://www.linkedin.com/mypreferences/d/download-my-data)
2. Click **Get a copy of your data**
3. Select **all categories** (or at minimum: Connections, Messages, Invitations, Company Follows)
4. Click **Request archive** — LinkedIn emails you a download link within ~24 hours
5. Download and unzip the archive

</details>

### Prerequisites

- Python 3.9+ (no pip installs needed — stdlib only)
- Claude Code with skills support

## Skills

### [LinkedIn Data Viz](skills/linkedin-data-viz/) — 10 Interactive Visualizations

> [**View Live Demo**](https://thatrebeccarae.github.io/linkedin-toolkit/) — See all 10 visualizations with sanitized sample data.

Turn a LinkedIn data export into a complete visual analysis:

| Visualization | What It Shows |
|--------------|---------------|
| **Network Universe** | D3.js force-directed graph of connections clustered by role |
| **Inferences vs Reality** | LinkedIn's algorithmic guesses about you vs actual data |
| **High-Value Messages** | Unanswered messages ranked by potential value |
| **Company Follows** | Followed companies grouped by industry |
| **Inbound vs Outbound** | Connection request patterns over time |
| **Connection Quality** | Relationship depth analysis (Active / Dormant / Never Messaged) |
| **Connection Timeline** | Recent connections with engagement data |
| **Inbox Quality** | Genuine conversations vs noise over time |
| **Does Posting Work?** | Posting frequency correlated with connection growth |
| **Career Strata** | Your network as geological layers by career phase |

Plus a unified dashboard linking all visualizations together.

All data stays local. No API keys. No servers. Just Python, your browser, and your LinkedIn export.

<details>
<summary><strong>Sanitize for sharing</strong></summary>

Want to share your visualizations publicly? The built-in sanitizer replaces real names and companies with plausible fakes — all patterns stay intact but your contacts' privacy is protected.

</details>

## Contributing

Bug reports, documentation fixes, and new skill ideas are welcome. Please open an issue first for new skills so we can discuss scope and approach.

## License

MIT License. See [LICENSE](LICENSE) for details.

<div align="center">

---

**Your LinkedIn data, visualized.** Install the skill. Say "analyze my LinkedIn data export." See your network clearly for the first time.

</div>

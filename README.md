<h2 align="center">Huntarr - Find Missing & Upgrade Media Items</h2>

<p align="center">
  <img src="frontend/static/logo/128.png" alt="Huntarr Logo" width="100" height="100">
</p>

---

<div align="center">

| **Sonarr** | **Radarr** | **Lidarr** | **Readarr** |
|:----------:|:----------:|:----------:|:-----------:|
| <img src="https://img.shields.io/badge/Status-Ready-green?style=flat" alt="Ready" /> | <img src="https://img.shields.io/badge/Status-Ready-green?style=flat" alt="Ready" /> | <img src="https://img.shields.io/badge/Status-Ready-green?style=flat" alt="Ready" /> | <img src="https://img.shields.io/badge/Status-Ready-green?style=flat" alt="Ready" /> |

| **Whisparr v2** | **Whisparr v3** | **Bazarr** |
|:---------------:|:---------------:|:----------:|
| <img src="https://img.shields.io/badge/Status-Ready-green?style=flat" alt="Ready" /> | <img src="https://img.shields.io/badge/Status-Ready-green?style=flat" alt="Ready" /> | <img src="https://img.shields.io/badge/Status-Not%20Ready-red?style=flat" alt="Not Ready" /> |

</div>

## Table of Contents
- [Overview](#overview)
- [Why You Need Huntarr](#why-you-need-huntarr)
- [Installation Methods](#installation-methods)
- [How It Works](#how-it-works)
- [Screenshots](#screenshots)
- [The Perfect Pair: Huntarr & decluttarr](#the-perfect-pair-huntarr--decluttarr)

## Overview

This application continually searches your media libraries for missing content and items that need quality upgrades. It automatically triggers searches for both missing items and those below your quality cutoff. It's designed to run continuously while being gentle on your indexers, helping you gradually complete your media collection with the best available quality.

## Why You Need Huntarr

Huntarr is an automatic missing content hunter for Sonarr, Radarr, Lidarr, Readarr, and Whisparr.
Think of it as the missing piece that actually completes your media automation setup by finding and downloading all the content your *arr apps aren't actively searching for.

**The problem**: Your *arr apps only monitor RSS feeds for new releases. They don't go back and search for missing episodes/movies already in your library.

**The solution**: Huntarr systematically scans your entire library, finds all missing content, and searches for it in small batches that won't overwhelm your indexers or get you banned. It's the difference between having a "mostly complete" library and actually having everything you want.

## Installation Methods

### Docker (Recommended)

```bash
docker run -d \
  --name huntarr \
  -p 9705:9705 \
  -v /path/to/config:/config \
  --restart unless-stopped \
  ghcr.io/adamflagg/huntarr:latest
```

### Docker Compose

```yaml
services:
  huntarr:
    image: ghcr.io/adamflagg/huntarr:latest
    container_name: huntarr
    ports:
      - "9705:9705"
    volumes:
      - /path/to/config:/config
    restart: unless-stopped
```

## How It Works

### Continuous Automation Cycle

1. **Connect & Analyze** - Huntarr connects to your Sonarr/Radarr/Lidarr/Readarr/Whisparr instances and analyzes your media libraries to identify both missing content and potential quality upgrades.

2. **Hunt Missing Content** - Efficiently refreshes by skipping metadata to reduce disk I/O and database load, automatically skips content with future release dates, provides precise control over how many items to process per cycle, and focuses only on content you've marked as monitored.

3. **Hunt Quality Upgrades** - Finds content below your quality cutoff settings for improvement, uses batch processing to set specific numbers of upgrades per cycle, automatically pauses when download queue exceeds your threshold, and waits for commands to complete with consistent timeouts.

4. **API Management** - Implements hourly caps to prevent overloading your indexers, uses consistent API timeouts (120s) across all applications, and provides visual indicators showing API usage limits.

5. **Repeat & Rest** - Huntarr waits for your configured interval (adjustable in settings) before starting the next cycle, ensuring your indexers aren't overloaded while maintaining continuous improvement of your library.

---

## Screenshots

<p align="center">
  <img width="100%" alt="Homepage" src="https://github.com/user-attachments/assets/c060962c-01ee-4f53-a5ee-c67f31432e40" style="border: 1px solid #30363d; border-radius: 6px; margin-bottom: 10px;" />
</p>

<p align="center">
  <img width="100%" alt="Logger UI" src="https://github.com/user-attachments/assets/93c1a5d3-e82a-416a-8d41-0379ea221d7a" style="border: 1px solid #30363d; border-radius: 6px; margin-bottom: 10px;" />
</p>

<p align="center">
  <img width="930" alt="Settings UI" src="https://github.com/user-attachments/assets/e87867f8-0a8c-48d8-b6ef-234caa33e41f" style="border: 1px solid #30363d; border-radius: 6px;" />
</p>

---

## The Perfect Pair: Huntarr & decluttarr

<p align="center">
  <img src="frontend/static/logo/128.png" alt="Huntarr" width="64" height="64">
  <span style="font-size: 32px; margin: 0 15px;">+</span>
  <img src="https://raw.githubusercontent.com/ManiMatter/decluttarr/latest/images/logo.png" alt="decluttarr" width="64" height="64">
</p>

**Huntarr** is the compulsive librarian who finds missing media and upgrades your existing content. It fills in the blanks and improves what you already have.

**decluttarr** ([![GitHub stars](https://img.shields.io/github/stars/ManiMatter/decluttarr?style=social)](https://github.com/ManiMatter/decluttarr/stargazers)) watches your *arr download queues and removes stalled or unneeded downloads automatically.

When combined, these tools create a powerful, self-sufficient media automation stack:

- **Huntarr** hunts for content to add to your library
- **decluttarr** keeps your download queues clean and removes stalled torrents
- Together, they create a reliable, hands-off media management system

Learn more about **decluttarr** at [https://github.com/ManiMatter/decluttarr](https://github.com/ManiMatter/decluttarr)

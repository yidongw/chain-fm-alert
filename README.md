# Chain.fm Net Addrs Monitor

A Node.js script that monitors the Net Addrs value on chain.fm/trending and alerts when it exceeds a threshold.

## Features

- Automatically monitors Net Addrs value on chain.fm/trending
- Alternates between 5m and 1h time periods
- Sounds an alert when Net Addrs value reaches or exceeds threshold (default: 7)
- Visual browser automation for easy monitoring
- Terminal-based acknowledgment system for alerts.

# To install dependencies:

```bash
bun install
```

# To run:

```bash
bun run index.ts
```

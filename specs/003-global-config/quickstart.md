# Quickstart: Global Config — 003-global-config

## First-time setup

```bash
chloe config init
# API Key (required): ****
# Model [claude-sonnet-4-6]: 
# Provider name [anthropic]: 
# Config saved to ~/.chloe/settings/config.toml

chloe chat --session hello
```

## Manage config

```bash
# Show all effective values (secrets masked)
chloe config show

# Update a value
chloe config set provider.model claude-opus-4-6

# Read a single value (unmasked)
chloe config get provider.model

# Temporarily override with env var — still works
CHLOE_MODEL=claude-haiku-4-5-20251001 chloe chat --session test
```

## Config file

```
~/.chloe/settings/config.toml
```

Manually editable. TOML format. Permissions: `0600`.

## Upgrading from a previous version

If you had `~/.chloe/chloe.db` from before this change, it is automatically
moved to `~/.chloe/sessions/chloe.db` on first startup. No manual action needed.

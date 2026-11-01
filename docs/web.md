# Web Version

## Overview
This document describes the web build and deployment process for the application.

## Automatic Updates
The Tauri updater can be triggered by publishing a new release. When a tag such as `v1` is pushed, the GitHub Release action creates a release that users can download, and the built‑in Tauri updater will detect the new version on next launch.

## Build
Run `npm run build-web` to produce the web assets in `dist/web`.

## Deployment
Upload `dist/web` to a static host (Netlify, Vercel, etc.).

## Links
- Repository: https://github.com/yourorg/yourrepo
- Docs: https://yourdomain.com/docs

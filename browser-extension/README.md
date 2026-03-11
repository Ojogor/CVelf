# cvElf — Chrome Extension (MV3)

## What it does
- One-click **save job** from the current tab.
- Captures:
  - Page URL
  - Page title
  - Visible page text (optional, recommended)
- Sends to your app at `POST /api/jobs/quick-add`.

## Install (developer mode)
1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder:
   - `D:\projects\job-tracker-app\browser-extension`

## Configure server URL
1. Open the extension’s **Options**
2. Set **Server URL** (default `http://localhost:3000`)
3. Click **Save** (Chrome may prompt for permission)

## Notes
- LinkedIn/Indeed can be noisy or incomplete. If analysis is weak, use the app’s **Paste Requirements Section** button for a stronger match.


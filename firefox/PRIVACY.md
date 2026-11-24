# Firefox Privacy Policy

Effective date: November 24, 2026

This policy applies to the Firefox / Zen desktop version of **Subtitle Downloader — YouTube & Bilibili** (字幕下載 — YouTube 與 Bilibili), provided by 陳祐群 (CHEN, YOU-CYUN).

## Purpose and local processing

The extension reads the current supported video's URL and title when its popup is opened. Only when the user requests subtitle discovery or download does it retrieve existing subtitle tracks from YouTube or Bilibili. It converts the selected track locally into a UTF-8 TXT file, preserving one line per subtitle segment.

It processes the video identifier, title, current Bilibili part, subtitle-track identifiers, languages, source labels, selected subtitle text, download filename and status. The developer operates no extension server and receives none of this information. There is no advertising, analytics, tracking, telemetry, speech recognition or AI service.

## Network transmission and consent

Necessary HTTPS requests go directly to YouTube / Google or Bilibili and their subtitle infrastructure, including validated Bilibili / hdslb.com subtitle hosts. These requests convey the requested video and subtitle identifiers or language, IP address and normal platform request information. The browser can use the current site's signed-in session where needed; the extension does not read, export or store password or cookie values.

The Firefox manifest declares required `browsingActivity` data transmission because the selected video and subtitle requests go to the originating platform. This declaration does not mean that the developer collects browsing history. Firefox displays its built-in consent information on installation. The extension requires Firefox 140 or later and does not implement a separate consent flow for older versions.

No data is sent to the developer, unrelated advertising or analytics services, data brokers or AI services. Platform providers independently process their own requests under their own terms and privacy policies. Data is not sold.

## Storage and retention

Video and subtitle-track metadata are temporarily held in `browser.storage.session`, in memory for the current browser session. Entries are removed when the video tab closes; lists older than 30 minutes are rejected, and session state does not persist after the browser ends.

TXT files are saved through Firefox's download system. Downloads initiated from a private tab are marked private so the corresponding download record belongs to private browsing. Files saved to disk remain after private windows close or the extension is removed. Users control and can delete those files and download-history records themselves.

## Permissions and choices

- `activeTab`: temporary access to the invoked video tab.
- `scripting`: run subtitle discovery and retrieval in that video page.
- `downloads`: save TXT and report download status.
- `storage`: keep temporary subtitle metadata in session memory.

The extension requests no permanent website access or complete browsing history permission. Users choose whether to allow it in private windows, can stop using it, and can uninstall it at any time. The developer has no server-side copy to access or delete.

## Contact and updates

For privacy questions, contact **陳祐群 (CHEN, YOU-CYUN)** at [a978090@gmail.com](mailto:a978090@gmail.com). Information voluntarily sent by email is used only to respond, provide support, maintain security or meet legal obligations. You may request deletion subject to applicable retention obligations.

The extension is not directed to children and does not require an account or age information. Changes to data practices will be reflected in this policy and disclosed as required before taking effect.

# Privacy Policy

**Effective date: September 6, 2026**

This Privacy Policy applies to the Chrome extension **Subtitle Downloader — YouTube & Bilibili** (Chinese name: **字幕下載 — YouTube 與 Bilibili**), provided by 祐群陳, referred to below as “the Extension” and “the Developer.”

## Summary

The Extension reads and processes limited information from the YouTube or Bilibili video page that the user is currently viewing so that it can find available subtitles and save a selected subtitle track as a TXT file.

Subtitle processing takes place locally in the user's browser. The Developer does not operate a server for the Extension and does not receive or store the video information, subtitle content, browsing information, or files processed by the Extension.

The Extension does not include advertising, analytics, tracking, telemetry, or third-party artificial intelligence services. It does not sell user data.

## Information Processed by the Extension

When the user opens the Extension, it locally reads the active tab's URL and title to determine whether the tab contains a supported YouTube or Bilibili video.

When the user asks the Extension to search for or download subtitles, the Extension may process:

- The current video page URL;
- The video title and video identifier;
- The current part number and title of a multi-part Bilibili video;
- Available subtitle track identifiers, languages, labels, and whether a track is manually created or automatically generated;
- The subtitle track selected by the user;
- The text of the selected subtitle track; and
- The status and filename of the download started through Chrome.

This information is used only to identify the current video, find its available subtitle tracks, convert the selected subtitle text into a UTF-8 TXT file, create a safe filename, and deliver the file through Chrome's download system.

The Extension does not request registration and does not directly access, read, store, or export passwords or cookie values.

## Network Requests and Third-Party Services

To provide its subtitle-download feature, the Extension sends necessary HTTPS requests directly from the user's browser to services operated by the platform hosting the current video:

- **YouTube / Google:** YouTube video pages and YouTube subtitle services;
- **Bilibili:** Bilibili video APIs and subtitle services; and
- **Bilibili subtitle hosting:** subtitle files hosted on Bilibili-controlled domains or `hdslb.com` domains returned by Bilibili.

These requests may include the video identifier, requested subtitle track or language, normal technical network information such as the user's IP address, and other information ordinarily required by the platform to return the requested content. Where required to access subtitles already available to the signed-in user, the browser may automatically use the user's existing YouTube or Bilibili session. The Extension does not expose cookie values to the Developer.

YouTube, Google, Bilibili, and their infrastructure providers process these requests under their own terms and privacy policies. The Developer does not control their independent data practices.

The Extension does not transmit information to the Developer or to unrelated advertising, analytics, data-broker, or AI services.

## Local Storage and Retention

The Extension temporarily stores the current video's identifier and title, available subtitle-track information, and related state in `chrome.storage.session`.

This information is stored only in the user's current browser session. The Extension refuses to use a saved subtitle list after 30 minutes. The corresponding session data is removed when the video tab is closed and is not retained after the browser session ends.

The selected subtitle text is converted locally and passed to Chrome for download. Downloaded TXT files and Chrome's download-history records are controlled by the user and by Chrome. Closing the tab, ending the browser session, or uninstalling the Extension does not delete files that have already been downloaded. Users can delete those files and download-history entries through their operating system and Chrome.

## Chrome Permissions

The Extension requests only the following Chrome permissions:

- **`activeTab`:** Provides temporary access to the current video tab after the user invokes the Extension.
- **`scripting`:** Runs the subtitle-discovery and subtitle-request logic in the current supported video page.
- **`downloads`:** Saves the generated TXT file and checks whether that download completed or was interrupted.
- **`storage`:** Temporarily stores subtitle-track information and video state in the current browser session.

The Extension does not request permanent access to all websites or access to the user's complete browsing history.

## Data Sharing and Sale

The Developer does not receive, sell, rent, trade, or otherwise share user data processed by the Extension. Information is sent only to YouTube, Google, Bilibili, and their subtitle-hosting infrastructure when necessary to perform the subtitle request initiated by the user, as described above.

## Security

All external requests made by the Extension are restricted to HTTPS. Subtitle data and temporary Extension state are processed locally in the browser. No method of electronic processing is completely secure, but the Extension limits its access and data handling to what is necessary for its stated subtitle-download purpose.

## User Choices and Data Deletion

Users can stop the Extension from processing information by closing its popup, closing the video tab, or uninstalling the Extension. Closing the video tab removes the Extension's corresponding session entry, and ending the browser session clears session storage.

Users are responsible for deleting downloaded TXT files and Chrome download-history entries. Because the Developer does not receive or store Extension usage data, video information, or subtitle content, the Developer has no server-side copy of that information to access or delete.

If a user contacts the Developer by email, the Developer will use the email address and message content only to respond to the inquiry, provide support, maintain security, or comply with applicable law. The user may request deletion of such correspondence, subject to any legal obligation requiring retention.

## Children's Privacy

The Extension is not directed to children, and the Developer does not knowingly collect personal information from children through the Extension. The Extension does not require an account or age information.

## Limited Use

The Extension's use of information is limited to providing its clearly disclosed, user-facing subtitle-download feature. The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Changes to This Policy

The Developer may update this Privacy Policy when the Extension's features, data practices, or applicable requirements change. The updated policy will be published at the same public URL with a revised effective date. If an update materially changes how the Extension handles user data, the change will also be disclosed as required before the new practice takes effect.

## Contact

For privacy questions or requests concerning information voluntarily provided to the Developer, contact:

**陳祐群（CHEN,YOU-CYUN）**

**Email:** [a978090@gmail.com](mailto:a978090@gmail.com)

# Releases

Every merge to `main` deploys automatically and gets an entry here, newest first. Versions follow `package.json`: new features bump the minor number, fixes the patch number.

## 0.3.0 (2026-11-14)

- **Pin chats.** "Keep forever" is now **Pin**: pinned chats sit in their own section at the top of the sidebar, are still never deleted, and can be dragged into any order by their grip (mouse, touch, or keyboard: Space, arrow keys, Space). New pins go to the top. Chats that were kept forever are now pinned.

## 0.2.0 (2026-11-14)

- **Chats name themselves.** After a chat's first reply, a fast model writes a short title (up to six words) in the chat's language, and the sidebar and header update right away. Renaming a chat yourself always wins, and existing chats keep their titles.

## 0.1.1 (2026-11-14)

- **Fixed:** on phones, Settings scrolled sideways and cut off the "Default model" cards.
- The browser test now checks every scrolling area, not just the page, and opens Settings on a phone.

## 0.1.0 (2026-11-14): first public release

- One shared family password, then a "Who's chatting?" profile picker with optional 4-digit PINs.
- A family admin (the first profile) who alone changes the models the family sees, the default model and the family password, and adds or deletes profiles.
- Streaming replies that keep going on the server if the phone sleeps or loses signal; Stop, Regenerate and "Retry with…" another model; `@` to switch models.
- Web search with sources for models that support it.
- Attachments: photos for vision models, text files, and PDF / Word / Excel / PowerPoint files read on the server. Drag and drop anywhere on the page.
- Chats with no new message for 90 days are deleted automatically unless kept forever; Settings can clear your own old chats.
- English and Vietnamese, per profile; replies follow the language of the question.

# Releases

Every merge to `main` deploys automatically and gets an entry here, newest first. Versions follow `package.json`: new features bump the minor number, fixes the patch number.

## 0.11.0 (2026-11-20)

- **Math shows as real formulas.** When a model writes an equation (fractions, powers, square roots, boxed answers), you now see it typeset the way it would look in a textbook, instead of a jumble of `\frac{...}` code in square brackets. Dollar amounts and percentages inside formulas come out right too. Prices in normal sentences, like "$5 and $10", stay plain text.
- **On a phone, a long formula scrolls sideways** inside the reply. Swipe it left to see the rest; the page itself doesn't move.
- **Photos you send show as pictures in the chat,** not just a file name. Tap one to open it full size (the same copy the model saw). Older chats get this too.

## 0.10.1 (2026-11-19)

- **Behind the scenes:** corrected the notes on how much server memory the country check uses. Nothing changes in the app itself.

## 0.10.0 (2026-11-19)

- **The chat only opens in Vietnam, Singapore and the US.** Anywhere else, people see a short page in Vietnamese and English instead of the chat. Travelling? Turn on the Singapore VPN.
- **iPhones and Macs with iCloud Private Relay keep working.** The first try at this (0.3.1) blocked them, because Private Relay addresses often look like they're in another country. Now the app trusts Apple's own list of which country each Private Relay address stands for, and refreshes it every day.
- **A quiet robot check at the family password.** Google reCAPTCHA checks in the background that a person is typing the password. There's nothing to click. If it ever says it couldn't confirm you're a person, wait a moment and try again.
- **Search engines are asked to stay away,** so the chat's login page won't show up in Google.

## 0.9.0 (2026-11-17)

- **Attach code and Jupyter notebooks.** Press the paperclip (or drop a file on the chat) to attach Python, JavaScript, TypeScript, Go, Rust, Java, C/C++, SQL, shell scripts, config files (YAML, TOML, INI) and many other code files. Markdown and plain text attach the same way as before.
- **Notebooks (.ipynb) are read cell by cell.** The model gets the text, the code and what each cell printed, error messages included, so you can ask "why does cell 4 fail?". Charts and pictures in a notebook are left out, and very long printouts keep only their start and end.
- Files that contain code blocks of their own, such as Markdown notes, now reach the model in one piece.

## 0.8.0 (2026-11-16)

- **On phones and tablets, Return now starts a new line.** Tap the orange send button to send. This makes longer messages easier to write and stops half-finished messages from going out by accident. If you liked Return sending the message, turn on **Settings → Chat → Press Enter to send**.
- **Shift+Enter always starts a new line** on a computer or a keyboard, even while the @ model list is open.
- **The app version is shown at the bottom of Settings**, so you can tell whether you have the latest update.

## 0.7.0 (2026-11-16)

- **Phones on their side work like phones.** Turned sideways, the chat list used to stay open and take a third of the screen. Now it tucks into the menu button (☰) just like when the phone is upright, so the chat gets the whole width. Buttons stay big enough for fingers, and the menu scrolls as a whole on the short screen, so you can see your chats.
- **Hide the sidebar on a computer or iPad.** Press the panel button at the top of the sidebar to put it away and give the chat the whole width; the button at the top left brings it back. Each device remembers your choice.
- On phones, the menu now has its own close button next to the app name.

## 0.6.0 (2026-11-15)

- **Family usage in Settings (admin only).** See how the family uses the app over the last 7, 30 or 90 days: messages per day, replies and failures for each model, pictures made, the most common errors and how many profiles were active. It shows totals only, never who said what.
- **Behind the scenes:** the app now tells Google Analytics which features get used (sending, retrying, pictures, the home-screen app) and how fast replies arrive. Only labels and numbers are sent, never what anyone writes or anyone's name.

## 0.5.0 (2026-11-15)

- **Make pictures.** Pick **GPT Image** in the model menu and describe what you want; the picture appears in the chat after about 10 seconds. Tap it to see it full size, press **Download** to save it, or long-press it on a phone to save it to Photos.
- **Change pictures.** Attach a photo and say what to change, or, right after a picture, just ask ("now make the house blue"). Start a new chat for a fresh picture.
- The other models now say they can't draw and point you to GPT Image, instead of pretending to.

## 0.4.3 (2026-11-15)

- **The app opens from anywhere again.** It was limited to Vietnam and Singapore, but iPhones and Macs with iCloud Private Relay often look like they're somewhere else, so family members could get "403 Forbidden" instead of the app. The family password and PINs still keep everyone else out.

## 0.4.2 (2026-11-15)

- **Behind the scenes:** the server now keeps only recent versions of the app for going back if an update breaks something: the last 5, or every version from the past week when there are more. Nothing changes in the app itself.

## 0.4.1 (2026-11-14)

- **A different app icon.** The orange "f" looked too much like Facebook. The icon is now a little white house that is also a speech bubble, with three dots, on orange: home and chat. If you already added the app to your home screen, remove it and add it again to get the new icon.

## 0.4.0 (2026-11-14)

- **A new app icon.** An orange "f" on a dark tile, in the app's own font, replaces the generic chat bubble on the login screen, the profile picker and the sidebar, and now also shows in the browser tab.
- **Add it to your home screen.** On iPhone (Share → Add to Home Screen) or Android (menu → Add to Home screen), the app gets its own icon and opens full screen, without the browser bars.

## 0.3.1 (2026-11-14)

- **Only Vietnam and Singapore can open the app.** Visitors from anywhere else get "403 Forbidden". The country list comes from DB-IP and refreshes itself every month. The other sites on the server are not affected.

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

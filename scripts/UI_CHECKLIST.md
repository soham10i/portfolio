# UI/UX Validation Checklist

Run through this checklist after every UI change. Check off each item before considering the change complete.

## 🔲 Visual — Dark Mode
- [ ] Background has depth (not flat black)
- [ ] Text is readable (contrast ratio > 4.5:1)
- [ ] Hero gradient "Patel" glow is visible
- [ ] Cards have elevation (shadow/border/glass effect)
- [ ] Navigation glass effect visible on scroll
- [ ] No element is invisible or washed out

## 🔲 Visual — Light Mode
- [ ] Background is clean (not harsh white)
- [ ] Blue/violet gradient orbs visible
- [ ] Text is readable on light background
- [ ] Cards have subtle borders/shadows
- [ ] Navigation transitions smoothly

## 🔲 Typography
- [ ] "Soham Patel" name is on one line (no wrapping)
- [ ] Name size scales down properly on mobile
- [ ] All headings use consistent sizing
- [ ] Body text is 14-16px minimum

## 🔲 Layout
- [ ] All 7 sections present: Hero → About → Experience → Projects → Skills → Research → Contact
- [ ] Sections have consistent vertical padding
- [ ] Content is centered and readable
- [ ] No horizontal scroll on any viewport

## 🔲 Animations & Transitions
- [ ] Hero elements animate in on load
- [ ] Scroll-triggered animations work
- [ ] Theme toggle is smooth (no flash)
- [ ] Chatbot open/close animation is smooth
- [ ] Chatbot maximize/minimize animation works

## 🔲 Chatbot
- [ ] Opens with sparkle button click
- [ ] Welcome message shows personality
- [ ] Responses have bullet points and bold text
- [ ] Responses are not cut off mid-sentence
- [ ] Maximize/minimize toggle works
- [ ] Suggested questions appear initially
- [ ] Clear button resets chat

## 🔲 Responsive
- [ ] Mobile: hamburger menu works
- [ ] Mobile: name fits on screen
- [ ] Tablet: 2-column grid for projects
- [ ] Desktop: full layout as designed

## 🔲 Performance
- [ ] Build completes with 0 TypeScript errors
- [ ] No console errors in browser
- [ ] Images/videos load properly
- [ ] Page loads in < 3s on local

## 🔲 Backend
- [ ] `/api/health` returns OK
- [ ] Chat endpoint returns structured responses
- [ ] Responses complete (not truncated)
- [ ] Response time < 5 seconds

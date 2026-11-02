# Person segmentation test fixture

`person.jpg` is a resized copy of the US government official portrait of Barack Obama
(Pete Souza / White House, public domain). It is ordinary-background test media, not user footage.
Source: https://storage.googleapis.com/mediapipe-assets/portrait.jpg
License context: https://commons.wikimedia.org/wiki/File:President_Barack_Obama.jpg

Optional moving-presenter verification uses a locally generated excerpt of the public-domain
White House weekly address, retrieved only for tests and never committed:
https://commons.wikimedia.org/wiki/File:2017-01-07_President_Obama%27s_Weekly_Address.webm

Set `ECONTENT_BACKGROUND_FIXTURE_DIR` to a directory containing `presenter.mp4`,
`portrait-presenter.mp4`, `background.png` and optionally `presenter-180.mp4`
(as documented in docs/PERSON-SEGMENTATION.md) to exercise real moving footage and the three-minute recording.

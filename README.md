# PlantUML Diagrams

**Your PlantUML diagrams, drawn where you read them.** A `.puml` file in Nextcloud opens as a picture, edits with the diagram redrawing beside the source, and a folder README shows its diagrams instead of their code. 📐

[![🧪 Tests](https://github.com/kubed-io/nextcloud-plantuml/actions/workflows/tests.yml/badge.svg)](https://github.com/kubed-io/nextcloud-plantuml/actions/workflows/tests.yml)
[![🛡️ Quality](https://github.com/kubed-io/nextcloud-plantuml/actions/workflows/quality.yml/badge.svg)](https://github.com/kubed-io/nextcloud-plantuml/actions/workflows/quality.yml)
[![🔗 Integration](https://github.com/kubed-io/nextcloud-plantuml/actions/workflows/integration.yml/badge.svg)](https://github.com/kubed-io/nextcloud-plantuml/actions/workflows/integration.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Nextcloud](https://img.shields.io/badge/Nextcloud-32--34-0082c9?logo=nextcloud&logoColor=white)](https://apps.nextcloud.com)
[![PHP](https://img.shields.io/badge/PHP-%E2%89%A58.1-777bb4?logo=php&logoColor=white)](composer.json)

---

## The whole idea, in one breath

Point the app at a PlantUML server. Every `.puml` in your Nextcloud is now a diagram, and every README that quotes or embeds one shows the picture.

```
Diagrams/
├── README.md            ← its ```plantuml fence and ![](Order flow.puml) are drawn
├── Order flow.puml      ← click: the diagram. Right-click: edit it, source beside picture
└── Checkout.puml
```

The app holds no diagrams of its own and the server keeps nothing. A `.puml` is an ordinary Nextcloud file: share it, version it, move it, trash it, restore it — all of that is Nextcloud's, untouched. The server only ever draws. 🖼️

---

## ✨ Click it, and it's a picture

A `.puml` file wears its own icon and opens in Nextcloud's image viewer, the same lightbox your photos use. No download, no copy-paste into a website: the diagram, drawn fresh from the file as it is right now.

A URL does the same. Ask the app for the image of a file by its path and you get the SVG back, for anyone who can read the file and for nobody else.

👀 [`diagrams/view.feature`](features/diagrams/view.feature)

---

## ✍️ Edit it, and watch it change

**Edit diagram** opens the source on the left and the diagram on the right, redrawing as you type. PlantUML keywords, arrows and messages are highlighted; **Save** writes the file; and if someone else saved it while you were typing, you're told rather than overwritten.

Prefer plain text? **Open with text editor** gives you Nextcloud's own editor on the source, as it would for any text file.

**+ New → Diagram** starts one, already holding `@startuml` and `@enduml`, and opens the editor on it.

✍️ [`diagrams/edit.feature`](features/diagrams/edit.feature) · ➕ [`diagrams/create.feature`](features/diagrams/create.feature)

---

## 📖 READMEs that draw themselves

This is the part we're smug about. 😏

Drop a README into a folder and Nextcloud shows it above the files. Put a diagram in it either way and it's drawn in place:

````markdown
```plantuml
@startuml
Customer -> Shop : place order
@enduml
```

![Order flow](Order flow.puml)
````

The fence renders where it stands. The image tag renders the file beside the README, so one `.puml` can be the diagram in the viewer, the thing you edit, *and* the picture in the README, with nothing to keep in sync. The fence tag is `plantuml`, the one every other tool agrees on.

📖 [`readme/render.feature`](features/readme/render.feature)

---

## 🛠 Setup, in two moves

**1. Run a PlantUML server.** The official [`plantuml/plantuml-server`](https://hub.docker.com/r/plantuml/plantuml-server) image is all it takes; it needs no account and holds no state. Its own `PLANTUML_SECURITY_PROFILE` decides what diagrams may `!include`, and that's the server's setting, not this app's.

**2. Point the app at it.** Admin settings → PlantUML → the server URL, then **Test connection**, which reports the PlantUML version the server is running — or says which of the three things is wrong: not set, unreachable, or not a PlantUML server.

🔌 [`connection/admin.feature`](features/connection/admin.feature)

---

## ⌨️ Every button is also a command

The whole setup is scriptable, so a Kubernetes init job can stand the thing up with no clicking. Exit `0` on success, non-zero on failure.

```sh
occ plantuml:set-url http://plantuml.flow.svc
occ plantuml:test-connection
occ plantuml:show-config
```

---

## 📋 The specs are the docs

Every feature above links to an **executable specification** — a Gherkin `.feature` file under [`features/`](features/) written in plain language, which also *drives the integration tests* against a real Nextcloud and a real PlantUML server. They're written before the code and kept true after it: a scenario counts as done only once CI has run it green. 🧪

Read [`features/README.md`](features/README.md) for how they're organised.

---

## 📜 Licence & trademark

AGPL-3.0-or-later. See [LICENSE](LICENSE).

This is a community integration and is not affiliated with or endorsed by the PlantUML project. "PlantUML" is used here only to identify the software this app integrates with.

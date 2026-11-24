<div align="center">

# 🎵 Solyx Music

**Ультимативная модификация официального клиента Яндекс Музыки с красивым Apple-визуалом, живым Mesh-фоном, скачиванием треков и воспроизведением без Плюса.**

<br/>

[![Скачать для Windows](./assets/download-windows.svg)](https://github.com/f1natory/SolyxMusic/releases/latest/download/Solyx-Music-2.3.0-Windows-x64-Setup.exe)

[Portable для Windows x64](https://github.com/f1natory/SolyxMusic/releases/latest/download/Solyx-Music-2.3.0-Windows-x64-Portable.exe) · [Все файлы релиза](https://github.com/f1natory/SolyxMusic/releases/latest)

Готовые сборки доступны только для **Windows x64**.

[![Download](https://img.shields.io/github/downloads/f1natory/SolyxMusic/total?style=for-the-badge&logo=windows&logoColor=white&label=Download&color=FFCC00&labelColor=18181b)](https://github.com/f1natory/SolyxMusic/releases/latest)
[![Stars](https://img.shields.io/github/stars/f1natory/SolyxMusic?style=for-the-badge&logo=apachespark&logoColor=white&label=Stars&color=f59e0b&labelColor=18181b)](https://github.com/f1natory/SolyxMusic/stargazers)
[![Updated](https://img.shields.io/github/last-commit/f1natory/SolyxMusic?style=for-the-badge&logo=github&logoColor=white&label=Updated&color=06b6d4&labelColor=18181b)](https://github.com/f1natory/SolyxMusic/commits)

<br/>
<br/>

<img src="./assets/card.png" alt="Solyx Music Showcase" width="100%" style="border-radius: 12px;" />

</div>

<br/>

> [!WARNING]
> Яндекс начал вешать плашку «Уязвимость в приложении» или «Промокод Upgrade» и вставлять рекламу в треки для некоторых аккаунтов, которые пользуются обходами Плюса. Эта проблема полностью решается модом.
> Но к сожалению, некоторым аккаунтам Яндекс полностью отключает «Мою волну», это пофиксить уже невозможно, только создавать новый аккаунт.

---

## ⚡ Возможности

- ▸ **Без Плюса** — полноценное воспроизведение треков без подписки.
- ▸ **Apple Fullscreen** — живой динамический Mesh-градиент под цвет текущей обложки.
- ▸ **Тексты песен** — с красивым Apple-визуалом, плавным автоскроллом и перемоткой по клику.
- ▸ **Интерфейс и тема** — акцентные цвета, кастомные шрифты, масштабирование и переключение эффектов.
- ▸ **Hi-Fi звук** — максимальный битрейт и поддержка Lossless-звучания.
- ▸ **Загрузчик** — быстрое сохранение аудиозаписей в форматах FLAC и MP3.
- ▸ **Без рекламы** — полная блокировка рекламы, телеметрии и трекеров.
- ▸ **DevTools** — встроенная панель разработчика и отключение автообновлений.

---

## ⚠️ Ограничения

- **Региональные ограничения:** У Яндекса действуют строгие гео-ограничения — сервис доступен только в [определенных странах](https://yandex.ru/support/music/ru/registration-and-login#gde-dostupna-yandeks-muzyka). Если вы используете VPN, выберите подходящую локацию из списка.
- **Подкасты:** В данный момент не поддерживаются подкасты (работа над этим ведётся).

---

## 💻 Установка и использование

1. Перейдите на страницу **[релизов](https://github.com/f1natory/SolyxMusic/releases/latest)** и скачайте подходящую версию:
   - **Setup (.exe)** — полноценный установщик.
   - **Portable (.exe)** — портативная версия, готовая к запуску без установки.
2. Запустите файл — мод можно использовать параллельно с официальной версией Яндекс Музыки.

---

## 🧩 Разработка и добавление модов

Хотите добавить собственную функциональность или модификацию? Ознакомьтесь с подробным руководством:
👉 **[📘 MODDING_GUIDE.md](./MODDING_GUIDE.md)**

## Сборка из исходников

Нужны Windows x64, Bun и Node.js. Установите зависимости командой `bun install`.

- `bun run start` — загрузка официального клиента, применение мода и создание установщика.
- `bun run build:exe` — повторная локальная сборка portable и установщика из подготовленной версии 5.126.1 в `.versions/5.126.1/mod`.
- `bun run ui:build` — сборка интерфейса.
- `bun test src/mod/features/ui/components/visual/__tests__` — тесты обработки текстов песен.

После `build:exe` готовые EXE находятся в корне проекта. Рабочие каталоги и кэши находятся в `.versions` и не публикуются в Git. Файлы релиза доступны в [GitHub Releases](https://github.com/f1natory/SolyxMusic/releases/latest).

Новости проекта: [Telegram SolyxClub](https://t.me/SolyxClub).

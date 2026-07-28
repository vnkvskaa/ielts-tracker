# IELTS Tracker

Личный трекер подготовки к IELTS Academic: хитмап активности, ежедневные
задания по Writing/Speaking, лог баллов за пробники и ссылки на полезные
платформы. Статичный сайт, устанавливается как PWA на телефон и ноутбук.

## Установка на устройство

1. Открыть сайт в Chrome/Safari.
2. Меню браузера → «Добавить на главный экран» / «Установить приложение».

## Синхронизация между устройствами

Прогресс хранится в `data.json` в этом репозитории и читается/пишется через
GitHub API — отдельный бэкенд не нужен.

1. GitHub → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token.
2. Repository access: **Only select repositories** → `ielts-tracker`.
3. Permissions → Repository permissions → **Contents: Read and write**.
4. Скопировать токен и вставить его в приложении в разделе «Настройки
   синхронизации» (на каждом устройстве отдельно). Токен хранится только в
   localStorage браузера, никуда, кроме api.github.com, не отправляется.

## Публикация (GitHub Pages)

Settings → Pages → Source: **Deploy from a branch** → `main` / `root`.

Репозиторий публичный (нужно для бесплатного Pages) — данные о баллах
технически доступны по прямой ссылке на `data.json`, но не индексируются и
не рекламируются.

# Universal Graphics Converter — ТЗ/README для другого ИИ

## 0) Цель
Сделать **универсальный конвертер графических форматов** (растровых, векторных, документов с картинками, иконок), который:
- конвертирует **одиночные файлы** и **пакеты** (папки / zip);
- умеет **превью**, **профили качества**, **ресайз/кроп/паддинг**, **цветовые профили**, **метаданные**;
- работает как **CLI** (обязательно) и опционально как **GUI** (десктоп) + опционально **Web API**.

Проект должен быть модульным: легко добавлять новые форматы/кодеки без переписывания ядра.

---

## 1) Основные сценарии (Use cases)
1. **Конвертация 1 файла**: `input.png -> output.webp`
2. **Пакетная конвертация папки**: все `*.jpg` в `*.avif`, сохранение структуры каталогов
3. **Мультистраничные форматы**:
   - PDF -> PNG (каждая страница в отдельный файл)
   - TIFF (multipage) -> WEBP/PNG (по страницам)
4. **Вектор -> растр**:
   - SVG/AI/EPS/PDF page -> PNG/WebP/AVIF, с DPI и антиалиасингом
5. **Иконки**:
   - SVG/PNG -> ICO (набор размеров), ICNS
6. **Сохранение/удаление метаданных**:
   - EXIF/IPTC/XMP: keep/strip + выборочно
7. **Цвет**:
   - sRGB / Display P3 / CMYK (где возможно) + ICC профили
8. **Оптимизация веса**:
   - WebP/AVIF/JPEG quality, lossless/lossy, chroma subsampling
9. **Отчет/лог**:
   - итоговый отчет: сколько файлов успешно, сколько пропущено, ошибки

---

## 2) Поддерживаемые форматы (MVP и расширения)

### 2.1 MVP (обязательный минимум)
**Вход/Выход**:
- Растр: PNG, JPEG/JPG, WebP, TIFF (включая multipage по возможности), BMP
- Вектор: SVG (вход), PDF (вход для рендеринга страниц)
- Анимация (минимально): GIF -> WebP (по возможности)

**Операции**:
- конвертация формата
- ресайз (contain/cover + сохранение пропорций)
- качество/сжатие
- strip/keep метаданные
- пакетная обработка

### 2.2 Расширения (после MVP)
- AVIF, HEIC/HEIF (если доступно в окружении)
- PSD (как вход, хотя бы flatten)
- AI/EPS (через Ghostscript/Imagemagick при наличии)
- RAW (через dcraw/libraw — опционально)
- ICO/ICNS
- APNG, animated WebP

---

## 3) Нефункциональные требования
- **Кроссплатформенность**: Windows (приоритет), Linux, macOS
- **Стабильность**: не падать на битых файлах; выдавать понятную ошибку
- **Производительность**:
  - параллельная обработка пакета (пул потоков/процессов)
  - ограничение по RAM
- **Детерминированность**: одинаковые входные → одинаковые выходные при одинаковых настройках
- **Безопасность**:
  - защита от zip-slip при распаковке
  - лимиты на размер и количество страниц/кадров
- **Логи**: JSON-логи + человекочитаемый режим
- **Тестируемость**: unit + интеграционные тесты на наборе эталонных файлов

---

## 4) Выбор стека (рекомендуемая реализация)
Два пути — выбрать один.

### Вариант A (рекомендую для “всех форматов”): Node.js + нативные движки
- CLI: Node.js (TypeScript)
- Растр: **Sharp** (libvips)
- PDF/SVG рендер:
  - SVG: sharp умеет
  - PDF: через **Poppler** (pdftoppm) или **Ghostscript** / или ImageMagick (если допустимо)
- Метаданные: **exiftool** (как бинарь) или библиотека (часто проще exiftool)
- Пакеты: worker_threads / child_process pool

Плюсы: быстро, удобно для CLI, хороший DX.  
Минусы: PDF/AI/EPS/HEIC иногда зависят от внешних бинарей.

### Вариант B: Python (если хочется “комбайн” и проще интеграция)
- CLI: Python (Typer/Click)
- Растр: Pillow + pillow-avif-plugin (если нужно), pyvips
- PDF: PyMuPDF или pdf2image (poppler)
- Метаданные: exiftool (subprocess) или piexif (частично)
- Параллельность: multiprocessing

Плюсы: проще прототипировать, богатая экосистема.  
Минусы: производительность/упаковка под Windows иногда сложнее.

> Для Windows-ориентированного продукта с хорошей скоростью чаще удобнее Node+Sharp.

---

## 5) Архитектура (модули)
Проект должен быть построен как **ядро + плагины кодеков**.

### 5.1 Сущности
- **Job**: одна задача конвертации (input -> output + options)
- **Batch**: набор Job + общие настройки + лимиты
- **Options**:
  - outputFormat, quality, lossless, effort
  - resize: width/height/mode(contain|cover|stretch), background, dpi
  - metadata: keep|strip|selective
  - color: srgb|p3|cmyk + iccPath
  - pages: all|range (для PDF/TIFF)
  - frames: all|first|range (для GIF/WebP)
- **Result**:
  - status: ok|skipped|failed
  - timings
  - inputInfo/outputInfo (размер, формат, страницы, байты)
  - error (code + message + stack optional)

### 5.2 Модули
1. `core/` — оркестрация
   - планировщик задач
   - пул воркеров
   - лимиты
2. `io/`
   - чтение файлов/папок/zip
   - запись результатов, создание каталогов
   - safe path
3. `detect/`
   - определение формата (по сигнатуре/расширению)
   - извлечение базовой инфы (размер, pages/frames)
4. `codecs/` — плагины
   - raster codec (png/jpg/webp/avif…)
   - vector renderer (svg->raster)
   - pdf renderer (pdf->raster/pages)
   - icon builder (ico/icns)
5. `ops/`
   - resize/crop/pad
   - color transform
   - metadata handler
6. `cli/`
   - команды, парсинг аргументов, вывод прогресса
7. `report/`
   - отчет JSON + summary table

---

## 6) CLI спецификация (обязательная)
Бинарь: `ugc` (Universal Graphics Converter)

### 6.1 Команды
1) Конвертация файла:
```bash
ugc convert input.png -o output.webp --quality 82
```

2) Пакетная конвертация папки:
```bash
ugc batch ./in --out ./out --to avif --quality 45 --recursive
```

3) PDF -> PNG по страницам:
```bash
ugc pdf ./file.pdf --out ./out --dpi 200 --pages 1-5
```

4) Показать инфо о файле:
```bash
ugc info input.tiff
```

5) Пресеты:
```bash
ugc preset list
ugc preset apply web-fast ./in --out ./out
```

### 6.2 Общие опции
- `--to <format>` целевой формат (png|jpg|webp|avif|tiff|bmp|gif|ico|icns)
- `--quality <0-100>`
- `--lossless` (для webp/avif где применимо)
- `--effort <0-10>` (скорость/сжатие)
- `--resize <WxH>` например `1920x1080`
- `--fit contain|cover|stretch`
- `--bg "#RRGGBB"` фон при pad/alpha->jpg
- `--strip-metadata` / `--keep-metadata`
- `--icc <path>` применить ICC профиль
- `--threads N`
- `--dry-run`
- `--json` (машиночитаемый вывод)
- `--log-level error|warn|info|debug`

---

## 7) GUI (опционально, но желательно)
Минимальный GUI (Electron/Tauri):
- drag&drop файлов/папок
- выбор формата и пресета
- очередь задач + прогресс
- предпросмотр результата (миниатюра)
- кнопка “Открыть папку результата”
GUI должен вызывать **то же ядро**, что и CLI (не дублировать логику).

---

## 8) Web API (опционально)
REST:
- `POST /convert` (multipart: file + options)
- `POST /batch` (zip in -> zip out)
- `GET /health`
Важно: лимиты размеров, rate-limit, санитайзинг.

---

## 9) Пресеты (пример набора)
Хранить пресеты в JSON/YAML:
- `web-fast`: webp, q=75, resize max 1920, strip metadata
- `web-hq`: avif q=45 effort=8 keep metadata
- `print`: tiff lossless, dpi=300, keep icc
- `thumb`: png/webp 512x512 cover

---

## 10) Обработка ошибок и пропусков
- Если формат не поддержан → `failed` с кодом `UNSUPPORTED_FORMAT`
- Если файл битый → `failed` `DECODE_ERROR`
- Если выходной файл существует:
  - по умолчанию: `skip`
  - опция `--overwrite`: перезаписать
- Если у PDF слишком много страниц:
  - лимит `--max-pages` (default 200) иначе ошибка/обрезка

---

## 11) Тесты
### 11.1 Unit
- парсер опций
- нормализация путей, safe-join
- определение формата по сигнатуре

### 11.2 Интеграционные
Набор эталонных файлов `test-assets/`:
- png/jpg/webp
- svg с прозрачностью
- pdf 3 страницы
- tiff multipage

Проверять:
- что создается нужное количество файлов
- что размеры/формат совпадают ожидаемо
- что metadata strip работает (проверка через exiftool)

---

## 12) Упаковка и доставка
### 12.1 Windows-ориориентированный релиз
- Собрать **один exe** (или install-пакет), который содержит:
  - бинарь `ugc`
  - зависимости (если нужны внешние: poppler/exiftool) — положить рядом и прописать пути
- Автообновление (опционально)

### 12.2 Docker (для API)
- образ с минимальными системными зависимостями
- volume для вход/выход

---

## 13) Структура репозитория (пример)
```
ugc/
  README.md
  package.json / pyproject.toml
  src/
    cli/
    core/
    codecs/
    ops/
    io/
    detect/
    report/
  presets/
    web-fast.json
    web-hq.json
  test/
  test-assets/
  dist/
```

---

## 14) Definition of Done (готовность MVP)
MVP считается готовым, если:
- `ugc convert` и `ugc batch` работают на Windows
- Поддержаны PNG/JPG/WebP/TIFF + SVG->PNG/WebP + PDF->PNG (по страницам)
- Есть ресайз + качество + strip/keep metadata
- Есть JSON-отчет по батчу
- Покрытие тестами основных путей
- Есть сборка релиза (exe/zip) и инструкция установки

---

## 15) Примечания для реализации (важные детали)
- Детект формата делать **не только по расширению**, а по сигнатуре (magic bytes), иначе будут сюрпризы.
- Все операции должны быть **stream-friendly**, насколько это возможно (для больших файлов).
- Для альфа-канала при конверте в JPG: требовать `--bg`, иначе дефолт белый.
- Стараться сохранять имя файла + суффиксы страниц:
  - `file.pdf` page 1 -> `file_p001.png`
- Логи: человекочитаемо + JSON режим.

---

## 16) Минимальный пример ожидаемого JSON-отчета
```json
{
  "startedAt": "2026-02-10T09:00:00+01:00",
  "finishedAt": "2026-02-10T09:00:12+01:00",
  "options": { "to": "webp", "quality": 82, "stripMetadata": true },
  "summary": { "total": 120, "ok": 118, "skipped": 1, "failed": 1 },
  "items": [
    {
      "input": "in/a.png",
      "output": "out/a.webp",
      "status": "ok",
      "inputInfo": { "format": "png", "width": 2048, "height": 2048, "bytes": 345678 },
      "outputInfo": { "format": "webp", "width": 2048, "height": 2048, "bytes": 123456 },
      "timingsMs": { "decode": 12, "ops": 5, "encode": 18, "total": 38 }
    }
  ]
}
```

---

## 17) Что делать “другому ИИ” по шагам
1) Выбрать стек (A или B) и зафиксировать зависимости под Windows.
2) Реализовать `ugc info` (детект + извлечение метаданных) — это база.
3) Реализовать конвертацию растровых форматов (png/jpg/webp/tiff) через выбранный движок.
4) Добавить операции `resize/fit/bg`, `quality/lossless/effort`, `keep/strip metadata`.
5) Реализовать batch-режим + пул воркеров + отчет JSON.
6) Добавить рендер PDF->растры (Poppler/Ghostscript/PyMuPDF).
7) Добавить SVG->растры.
8) Сделать упаковку релиза под Windows (exe/zip) + README по установке.
9) (Опционально) GUI оболочка, использующая ядро.

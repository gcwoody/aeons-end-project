# 卡表图片拆分工具（Python 版）

`split_card_sheets.py` 使用 Python 的 Pillow 库在单个进程中裁切图片，通常比每张卡都启动一次 IrfanView 快很多。

## 一次性安装（Miniconda）

本工具使用名为 `common` 的 Conda 环境。已安装该环境时，可跳过本节。

在 PowerShell 中执行以下命令创建环境并安装 Python 与 Pillow：

```powershell
& "D:\software\miniconda3\Scripts\conda.exe" create --yes --name common --override-channels --channel conda-forge python=3.12 pillow
```

如果 `common` 环境已经存在，只需安装或更新 Pillow：

```powershell
& "D:\software\miniconda3\Scripts\conda.exe" install --yes --name common --override-channels --channel conda-forge pillow
```

本项目当前已验证使用 Python `3.12.14` 和 Pillow `12.3.0`。使用 `conda-forge` 可以避免默认 Anaconda 源首次使用时的服务条款确认。

## 修改参数

打开 `split_card_sheets.py`，文件顶部有以下配置：

```python
INPUT_DIRECTORY = Path(__file__).parent / "input"
OUTPUT_DIRECTORY = Path(__file__).parent / "output-python"
ROWS = 6
COLUMNS = 10
CROP_REDUCTION_PIXELS = 2
```

- **图片路径**：修改 `INPUT_DIRECTORY`。默认从本文件夹内的 `input` 读取 JPG、JPEG、PNG 图片。
- **图片输出**：修改 `OUTPUT_DIRECTORY`。默认输出到本文件夹内的 `output-python`。
- **图片行数与列数**：修改 `ROWS` 和 `COLUMNS`。例如卡表为 7 行、5 列时，设置为 `ROWS = 7`、`COLUMNS = 5`。
- **裁切缩减像素**：修改 `CROP_REDUCTION_PIXELS`。该值是每张卡宽度和高度的**总缩减量**，必须是偶数。设为 `2` 时，左、右、上、下边缘都会各缩进 1 像素；设为 `30` 时，每边各缩进 15 像素。设为 `0` 可关闭此效果。

也可以填入绝对路径，例如：

```python
INPUT_DIRECTORY = Path(r"D:\\images\\source")
OUTPUT_DIRECTORY = Path(r"D:\\images\\cards")
```

## 运行

1. 将待拆分的卡表放到 `input` 文件夹。
2. 在本文件夹的 PowerShell 中执行：

```powershell
& "D:\software\miniconda3\Scripts\conda.exe" run --name common python .\split_card_sheets.py
```

这条命令会直接使用 `common` 环境，无需先执行 `conda activate common`。

输出文件会按原始图片名分别存入子文件夹，命名为 `card_001.jpg`、`card_002.jpg` 等，顺序是从左到右、从上到下。

每次处理一张原始卡表前，脚本会先删除该卡表对应的输出子文件夹，然后重新生成全部图片。这样当行数、列数或缩边参数改变时，不会遗留上一次生成的旧卡片。请不要把需要保留的其他文件放入该输出子文件夹。

## 非整除尺寸

有些卡表经过缩放后，图片总宽度和高度不能被行数、列数整除。脚本会按比例计算每张卡的网格边界，部分卡片的原始网格宽或高可能相差 1 像素。之后会将 `CROP_REDUCTION_PIXELS` 平分到左、右、上、下四个边缘，以排除相邻卡片可能出现的边缘像素。
import shutil
from pathlib import Path

from PIL import Image


# Modify these settings before running the script.
INPUT_DIRECTORY = Path(__file__).parent / "input"
OUTPUT_DIRECTORY = Path(__file__).parent / "output-python"
ROWS = 6
COLUMNS = 10
CROP_REDUCTION_PIXELS = 8
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
JPEG_QUALITY = 95


def split_sheet(image_path: Path) -> None:
    """Split one card sheet with proportional pixel boundaries."""
    with Image.open(image_path) as source_image:
        source_width, source_height = source_image.size
        sheet_output_directory = OUTPUT_DIRECTORY / image_path.stem
        if sheet_output_directory.exists():
            shutil.rmtree(sheet_output_directory)
        sheet_output_directory.mkdir(parents=True)
        edge_inset = CROP_REDUCTION_PIXELS // 2

        for row in range(ROWS):
            grid_top = row * source_height // ROWS
            grid_bottom = (row + 1) * source_height // ROWS

            for column in range(COLUMNS):
                grid_left = column * source_width // COLUMNS
                grid_right = (column + 1) * source_width // COLUMNS
                left = grid_left + edge_inset
                top = grid_top + edge_inset
                right = grid_right - edge_inset
                bottom = grid_bottom - edge_inset
                if right <= left or bottom <= top:
                    raise ValueError(
                        "CROP_REDUCTION_PIXELS is too large for the card dimensions."
                    )
                card_number = row * COLUMNS + column + 1
                output_path = sheet_output_directory / f"card_{card_number:03d}.jpg"

                card_image = source_image.crop((left, top, right, bottom)).convert("RGB")
                card_image.save(output_path, "JPEG", quality=JPEG_QUALITY)

    print(f"Split '{image_path.name}' into {ROWS * COLUMNS} cards.")


def main() -> None:
    if ROWS < 1 or COLUMNS < 1:
        raise ValueError("ROWS and COLUMNS must both be at least 1.")
    if CROP_REDUCTION_PIXELS < 0:
        raise ValueError("CROP_REDUCTION_PIXELS must be zero or greater.")
    if CROP_REDUCTION_PIXELS % 2 != 0:
        raise ValueError("CROP_REDUCTION_PIXELS must be an even number.")

    if not INPUT_DIRECTORY.is_dir():
        print(f"Input directory was not found: {INPUT_DIRECTORY}")
        return

    image_paths = sorted(
        path
        for path in INPUT_DIRECTORY.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )
    if not image_paths:
        print(f"No JPG, JPEG, or PNG images were found in: {INPUT_DIRECTORY}")
        return

    for image_path in image_paths:
        split_sheet(image_path)


if __name__ == "__main__":
    main()
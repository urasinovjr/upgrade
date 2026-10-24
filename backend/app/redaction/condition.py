import io

from PIL import Image

from app.redaction.raster import encode, pixel_box
from app.redaction.sanitize import PageImage


def crop_page(page: PageImage, region: dict) -> PageImage:
    image = Image.open(io.BytesIO(page.data))
    part = image.crop(pixel_box(region, image.width, image.height))
    return page.model_copy(
        update={"data": encode(part, page.content_type), "width": part.width, "height": part.height}
    )

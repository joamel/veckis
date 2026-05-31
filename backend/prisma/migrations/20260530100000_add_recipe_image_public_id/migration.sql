-- Track Cloudinary public_id so we can delete the asset on image change or recipe deletion.
ALTER TABLE "Recipe" ADD COLUMN "imagePublicId" TEXT;

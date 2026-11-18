export async function prepareEnrollmentPhoto(file) {
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('Escolha uma foto de até 12 MB.');
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 480;
    const context = canvas.getContext('2d');
    const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return canvas.toDataURL('image/jpeg', .9);
  } catch {
    throw new Error('Não foi possível abrir a foto. Escolha uma imagem JPG, PNG ou WebP.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

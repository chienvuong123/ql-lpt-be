export const convertJp2ToPng = async (base64) => {
  if (!base64) return null;

  // Trả nguyên JP2, để frontend xử lý
  return `data:image/jp2;base64,${base64}`;
};

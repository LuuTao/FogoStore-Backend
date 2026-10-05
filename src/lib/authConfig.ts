export const JWT_ISSUER = 'fogo-store-api';
export const JWT_AUDIENCE = 'fogo-store-web';

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET phải được cấu hình bằng chuỗi ngẫu nhiên tối thiểu 32 ký tự.');
  }
  return secret;
};

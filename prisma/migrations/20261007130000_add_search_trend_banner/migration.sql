-- Banner mặc định nằm phía trên danh sách Xu hướng tìm kiếm.
-- Có thể chỉnh sửa hoặc thay thế tại trang Quản lý Banner trong admin.
INSERT INTO "Banner" ("id", "title", "imageUrl", "linkUrl", "position", "isActive", "order", "createdAt")
VALUES (
  'search-trend-default-1',
  'MacBook Air M5',
  '/banners/banner1.png',
  '/macbook',
  'search_trend_banner',
  true,
  0,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

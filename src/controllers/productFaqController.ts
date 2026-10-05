import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sanitizePlainText } from '../lib/sanitizeHtml';

// Prisma client sẽ có model này sau khi chạy migrate/generate ở môi trường triển khai.
const productFaq = (prisma as any).productFaq;

const DEFAULT_PRODUCT_FAQS = [
  {
    question: 'Sản phẩm có phải hàng chính hãng không?',
    answer: 'FoGo Store cam kết sản phẩm chính hãng, nguồn gốc rõ ràng và được kiểm tra kỹ trước khi giao đến khách hàng.',
  },
  {
    question: 'Sản phẩm có được kiểm tra trước khi nhận không?',
    answer: 'Bạn có thể kiểm tra ngoại quan, phụ kiện và thông tin đơn hàng khi nhận. Nhân viên FoGo Store luôn hỗ trợ trong suốt quá trình nhận hàng.',
  },
  {
    question: 'Chính sách bảo hành như thế nào?',
    answer: 'Sản phẩm áp dụng chính sách bảo hành theo thông tin hiển thị tại trang sản phẩm và quy định hiện hành của FoGo Store.',
  },
  {
    question: 'Tôi có thể đổi trả sản phẩm không?',
    answer: 'FoGo Store hỗ trợ đổi trả theo điều kiện sản phẩm và chính sách bán hàng. Vui lòng liên hệ cửa hàng để được tư vấn nhanh nhất.',
  },
];

const ensureDefaultFaqs = async () => {
  const current = await productFaq.findMany({ orderBy: { order: 'asc' } });
  if (current.length > 0) return current;

  await productFaq.createMany({
    data: DEFAULT_PRODUCT_FAQS.map((item, index) => ({ ...item, order: index })),
  });
  return productFaq.findMany({ orderBy: { order: 'asc' } });
};

export const getProductFaqs = async (_req: Request, res: Response) => {
  try {
    const faqs = await ensureDefaultFaqs();
    return res.json({ success: true, data: faqs.filter((item) => item.isActive) });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getProductFaqsAdmin = async (_req: Request, res: Response) => {
  try {
    const faqs = await ensureDefaultFaqs();
    return res.json({ success: true, data: faqs });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const createProductFaq = async (req: Request, res: Response) => {
  try {
    const question = sanitizePlainText(req.body.question, 500);
    const answer = sanitizePlainText(req.body.answer, 5000);
    if (!question || !answer) return res.status(400).json({ success: false, error: 'Vui lòng nhập câu hỏi và câu trả lời' });

    const lastFaq = await productFaq.findFirst({ orderBy: { order: 'desc' } });
    const faq = await productFaq.create({
      data: { question, answer, isActive: req.body.isActive !== false, order: Number(req.body.order ?? (lastFaq?.order ?? -1) + 1) },
    });
    return res.status(201).json({ success: true, data: faq });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateProductFaq = async (req: Request, res: Response) => {
  try {
    const faq = await productFaq.update({
      where: { id: String(req.params.id) },
      data: {
        ...(req.body.question !== undefined && { question: sanitizePlainText(req.body.question, 500) }),
        ...(req.body.answer !== undefined && { answer: sanitizePlainText(req.body.answer, 5000) }),
        ...(req.body.isActive !== undefined && { isActive: Boolean(req.body.isActive) }),
        ...(req.body.order !== undefined && { order: Number(req.body.order) }),
      },
    });
    return res.json({ success: true, data: faq });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteProductFaq = async (req: Request, res: Response) => {
  try {
    await productFaq.delete({ where: { id: String(req.params.id) } });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

import { Router } from 'express';

// Router nghiệp vụ tự có xác thực + buộc đổi mật khẩu (API_GD2 §1.2): guard là câu lệnh đầu tiên của router, nên không
// thể quên. Router PHẢI được mount ở tiền tố riêng của nó (app.use('/api/<tiền tố>', router)); đường dẫn lạ ngoài các
// tiền tố vẫn rơi xuống 404 chuẩn. Module routes.js (trừ auth) chỉ được tạo router qua hàm này (test T206 kiểm).
export const businessRouter = (guard) => {
  const r = Router();
  r.use(...guard);
  return r;
};

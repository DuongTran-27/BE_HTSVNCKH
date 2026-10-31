# Câu hỏi cần con người trả lời

| # | Task | Câu hỏi | Phương án đề xuất | Trả lời |
|---|---|---|---|---|
| 1 | T201 (chặn T202, T203 và mọi task cần DB) | Docker Desktop không chạy được: máy đang **tắt ảo hóa trong BIOS** (`VirtualizationFirmwareEnabled=False`) và **Virtual Machine Platform** chưa bật (log: `engine linux/wsl failed to start: Virtual Machine Platform not enabled`). Cần người có quyền admin xử lý. | 1) Vào BIOS/UEFI bật Intel VT-x / AMD SVM. 2) PowerShell (Admin): `dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart`. 3) Khởi động lại, mở Docker Desktop, chạy `docker info`. Sau đó gõ `/lam-task T201` để devops chạy bằng chứng còn thiếu. Phương án thay thế nếu không bật được: cài PostgreSQL 16 bản Windows (có pg_trgm, unaccent) chạy cổng 54329 – báo lại để devops điều chỉnh. | |

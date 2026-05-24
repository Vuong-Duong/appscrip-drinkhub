---
trigger: always_on
---

1. Chỉ sửa đúng phạm vi tôi yêu cầu, không tự refactor hoặc thay đổi logic/structure ngoài phạm vi nếu không cần thiết.

2. Trước khi sửa hãy xác định các phần liên quan có thể bị ảnh hưởng.

3. Ưu tiên minimal change:

* sửa ít nhất có thể
* giữ compatibility với logic cũ

4. Nếu thay đổi ảnh hưởng phần khác thì phải update toàn bộ phần liên quan để giữ hệ thống hoạt động đồng nhất.

5. Sau khi sửa hãy tự verify:

* compile/type/runtime errors
* logic cũ vẫn hoạt động
* chức năng mới hoạt động đúng
* không phát sinh regression ngoài phạm vi sửa

6. Trả lời ngắn gọn, tập trung vào thay đổi cần thiết, không giải thích dài hoặc tạo report nếu tôi không yêu cầu.
 
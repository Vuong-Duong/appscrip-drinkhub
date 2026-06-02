---
trigger: always_on
---

1. Chỉ sửa đúng phạm vi tôi yêu cầu, không tự refactor hoặc thay đổi logic/structure ngoài phạm vi nếu không cần thiết.

2. Trước khi sửa hãy xác định các phần liên quan có thể bị ảnh hưởng.

3. Trước khi implement:
- nêu assumptions nếu có điểm chưa rõ
- nếu có nhiều cách hiểu thì hỏi lại thay vì tự chọn
- nếu có cách đơn giản hơn thì ưu tiên cách đơn giản

4. Ưu tiên minimal change:
- sửa ít nhất có thể
- giữ compatibility với logic cũ
- không thêm abstraction/config/flexibility nếu chưa được yêu cầu

5. Nếu thay đổi ảnh hưởng phần khác thì phải update toàn bộ phần liên quan để giữ hệ thống hoạt động đồng nhất.

6. Khi sửa code hiện có:
- match existing style/architecture
- không cleanup/refactor code không liên quan
- chỉ remove code/import/function do chính thay đổi mới làm dư thừa

7. Với task nhiều bước:
- nêu brief plan trước khi code
- xác định cách verify thành công

8. Sau khi sửa hãy tự verify:
- compile/type/runtime errors
- logic cũ vẫn hoạt động
- chức năng mới hoạt động đúng
- không phát sinh regression ngoài phạm vi sửa

9. Trả lời ngắn gọn, tập trung vào thay đổi cần thiết, không giải thích dài hoặc tạo report nếu tôi không yêu cầu.
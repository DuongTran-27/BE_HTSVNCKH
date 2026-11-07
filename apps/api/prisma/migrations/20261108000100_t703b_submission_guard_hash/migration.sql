-- T703b (m1 reviews/T609-bao-mat-v1.md): dòng OK thay thế phải kiểm đúng nội dung đã gửi (payload), không nhận
-- dòng "kiểm tra trước" của SV trên nội dung đã sửa. Hash phải trùng từng byte với contentHash() ở similarity/engine.js
-- (sha256 hex của JSON.stringify([title, summary, objectives, keywords]), keywords thiếu = [] như recheck.js).
CREATE OR REPLACE FUNCTION submission_payload_hash(p jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(
    '[' || coalesce(to_json(p->>'title')::text, 'null')
    || ',' || coalesce(to_json(p->>'summary')::text, 'null')
    || ',' || coalesce(to_json(p->>'objectives')::text, 'null')
    || ',[' || coalesce((SELECT string_agg(to_json(k)::text, ',' ORDER BY i)
                         FROM jsonb_array_elements_text(coalesce(p->'keywords', '[]'::jsonb)) WITH ORDINALITY AS e(k, i)), '')
    || ']]', 'UTF8')), 'hex')
$$;

CREATE OR REPLACE FUNCTION submission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_ok boolean; new_ok boolean;
BEGIN
  IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'similarityCheckId') <> (to_jsonb(OLD) - 'similarityCheckId') THEN
    RAISE EXCEPTION 'Bảng % chỉ cho phép thêm mới', TG_TABLE_NAME;
  END IF;
  SELECT status = 'OK' INTO old_ok FROM "SimilarityCheck" WHERE id = OLD."similarityCheckId";
  SELECT c.status = 'OK' AND c."topicId" = NEW."topicId" AND c."createdAt" > OLD."createdAt"
         AND c."contentHash" = submission_payload_hash(OLD.payload)
         AND NOT EXISTS (SELECT 1 FROM "ChangeRequest" r WHERE r."similarityCheckId" = c.id)
    INTO new_ok FROM "SimilarityCheck" c WHERE c.id = NEW."similarityCheckId";
  IF coalesce(old_ok, false) OR NOT coalesce(new_ok, false) THEN
    RAISE EXCEPTION 'Chỉ được thay kết quả FR06 lỗi bằng kết quả thành công mới hơn của cùng đề tài';
  END IF;
  RETURN NEW;
END $$;

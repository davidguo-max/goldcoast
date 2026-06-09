-- 修改 bonus 字段支持小数（0.2, 0.5, 1）
-- 执行路径：Supabase Dashboard → SQL Editor → New Query → Run

-- 1. 修改 bonus 字段类型为 DECIMAL(10,2)
ALTER TABLE students ALTER COLUMN bonus TYPE DECIMAL(10,2);

-- 2. 更新默认值为 1
ALTER TABLE students ALTER COLUMN bonus SET DEFAULT 1;

-- 3. 验证修改结果
SELECT 
    column_name, 
    data_type, 
    numeric_precision, 
    numeric_scale, 
    column_default
FROM information_schema.columns
WHERE table_name = 'students' AND column_name = 'bonus';

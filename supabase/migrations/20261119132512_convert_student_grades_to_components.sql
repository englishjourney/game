BEGIN;

-- Each quarter stores five components:
-- [Attendance, Learning materials, Assignments, Exam, Extra].
-- Preserve every existing numeric grade in the Extra component.
ALTER TABLE public.student_subject_grades
    ALTER COLUMN nota1 TYPE numeric[]
    USING ARRAY[NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, nota1],
    ALTER COLUMN nota2 TYPE numeric[]
    USING ARRAY[NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, nota2],
    ALTER COLUMN nota3 TYPE numeric[]
    USING ARRAY[NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, nota3],
    ALTER COLUMN nota4 TYPE numeric[]
    USING ARRAY[NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, nota4];

ALTER TABLE public.student_subject_grades
    ALTER COLUMN nota1 SET DEFAULT ARRAY[NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric],
    ALTER COLUMN nota2 SET DEFAULT ARRAY[NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric],
    ALTER COLUMN nota3 SET DEFAULT ARRAY[NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric],
    ALTER COLUMN nota4 SET DEFAULT ARRAY[NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric],
    ALTER COLUMN nota1 SET NOT NULL,
    ALTER COLUMN nota2 SET NOT NULL,
    ALTER COLUMN nota3 SET NOT NULL,
    ALTER COLUMN nota4 SET NOT NULL;

ALTER TABLE public.student_subject_grades
    ADD CONSTRAINT student_subject_grades_nota1_components_check CHECK (cardinality(nota1) = 5),
    ADD CONSTRAINT student_subject_grades_nota2_components_check CHECK (cardinality(nota2) = 5),
    ADD CONSTRAINT student_subject_grades_nota3_components_check CHECK (cardinality(nota3) = 5),
    ADD CONSTRAINT student_subject_grades_nota4_components_check CHECK (cardinality(nota4) = 5);

-- Keep independent assessment records for each teacher.
ALTER TABLE public.student_subject_grades
    DROP CONSTRAINT student_subject_grades_pkey,
    DROP CONSTRAINT student_subject_grades_updated_by_fkey;

ALTER TABLE public.student_subject_grades
    ALTER COLUMN updated_by SET NOT NULL;

ALTER TABLE public.student_subject_grades
    ADD CONSTRAINT student_subject_grades_pkey
        PRIMARY KEY (student_id, subject, updated_by),
    ADD CONSTRAINT student_subject_grades_updated_by_fkey
        FOREIGN KEY (updated_by) REFERENCES public.teachers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS student_subject_grades_teacher_subject_student_idx
    ON public.student_subject_grades (updated_by, subject, student_id);

DROP POLICY IF EXISTS "Teachers read grades for assigned subjects" ON public.student_subject_grades;
DROP POLICY IF EXISTS "Teachers insert grades for assigned subjects" ON public.student_subject_grades;
DROP POLICY IF EXISTS "Teachers update grades for assigned subjects" ON public.student_subject_grades;

CREATE POLICY "Teachers read own grades for assigned subjects"
    ON public.student_subject_grades
    FOR SELECT
    TO authenticated
    USING (
        updated_by = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1
            FROM public.teachers AS teacher
            WHERE teacher.id = (SELECT auth.uid())
              AND student_subject_grades.subject = ANY(teacher.subjects)
        )
    );

CREATE POLICY "Teachers insert own grades for assigned subjects"
    ON public.student_subject_grades
    FOR INSERT
    TO authenticated
    WITH CHECK (
        updated_by = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1
            FROM public.teachers AS teacher
            WHERE teacher.id = (SELECT auth.uid())
              AND student_subject_grades.subject = ANY(teacher.subjects)
        )
    );

CREATE POLICY "Teachers update own grades for assigned subjects"
    ON public.student_subject_grades
    FOR UPDATE
    TO authenticated
    USING (
        updated_by = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1
            FROM public.teachers AS teacher
            WHERE teacher.id = (SELECT auth.uid())
              AND student_subject_grades.subject = ANY(teacher.subjects)
        )
    )
    WITH CHECK (
        updated_by = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1
            FROM public.teachers AS teacher
            WHERE teacher.id = (SELECT auth.uid())
              AND student_subject_grades.subject = ANY(teacher.subjects)
        )
    );

COMMIT;

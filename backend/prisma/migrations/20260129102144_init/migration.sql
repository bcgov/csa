-- CreateTable
CREATE TABLE "contacts" (
    "id" SERIAL NOT NULL,
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT NOT NULL,
    "aka_last_name" TEXT NOT NULL,
    "aka_first_name" TEXT NOT NULL,
    "person_id_icm" TEXT NOT NULL,
    "person_id_mis" TEXT NOT NULL,
    "case_number" TEXT NOT NULL,
    "case_type" TEXT NOT NULL,
    "case_status" TEXT NOT NULL,
    "case_load" TEXT NOT NULL,
    "source_order" TEXT NOT NULL,
    "icm_integration_status" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "last_updated_at" TIMESTAMP(3) NOT NULL,
    "last_updated_by" TEXT NOT NULL,
    "gender" TEXT,
    "date_of_birth" DATE,
    "age" INTEGER,
    "legacy_file_number" TEXT,
    "service_office" TEXT,
    "assigned_to" TEXT,
    "csa_status" TEXT,
    "csa_status_effective_date" TIMESTAMP(3),
    "csa_sent_date" TIMESTAMP(3),
    "din" TEXT,
    "effective_legal_status" TEXT,
    "effective_date" TIMESTAMP(3),
    "expiry_date" DATE,
    "enroll_for_csa" TEXT,
    "mis_legal_authority_code" TEXT,
    "legal_authority_code" TEXT,
    "birth_city" TEXT,
    "birth_province" TEXT,
    "birth_country" TEXT,
    "placement_location" TEXT,
    "location_type" TEXT,
    "location_sub_type" TEXT,
    "placement_status" TEXT,
    "actual_start_date" TIMESTAMP(3),
    "actual_end_date" TIMESTAMP(3),
    "paid_unpaid" TEXT,
    "interrupted_placement" TEXT,
    "source_placement" TEXT,
    "service_provider_name" TEXT,
    "provider_id" TEXT,
    "place_of_service_name" TEXT,
    "agreement_type" TEXT,
    "agreement_status" TEXT,
    "agreement_start_date" TIMESTAMP(3),
    "agreement_end_date" TIMESTAMP(3),
    "termination_date" TIMESTAMP(3),
    "mcfd_contract" TEXT,
    "order_number" TEXT,
    "order_type" TEXT,
    "order_status" TEXT,
    "order_amount" TEXT,
    "order_effective_start_date" DATE,
    "product" TEXT,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" SERIAL NOT NULL,
    "batch_date" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "record_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "system_comments" TEXT,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_batch_details" (
    "id" SERIAL NOT NULL,
    "contact_id" INTEGER NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "transaction_type" TEXT NOT NULL,
    "system_comments" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "last_updated_at" TIMESTAMP(3) NOT NULL,
    "last_updated_by" TEXT NOT NULL,
    "status" TEXT,

    CONSTRAINT "contact_batch_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_files" (
    "id" SERIAL NOT NULL,
    "batch_id" INTEGER,
    "destination_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" TEXT,
    "delivered_at" TIMESTAMP(3),
    "downloaded_at" TIMESTAMP(3),
    "reference_numbers" INTEGER[],

    CONSTRAINT "transfer_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" SERIAL NOT NULL,
    "job_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "parent_job_id" INTEGER,
    "job_trigger" TEXT NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contact_batch_details_contact_id_batch_id_key" ON "contact_batch_details"("contact_id", "batch_id");

-- CreateIndex
CREATE INDEX "job_runs_status_idx" ON "job_runs"("status");

-- CreateIndex
CREATE INDEX "job_runs_parent_job_id_idx" ON "job_runs"("parent_job_id");

-- CreateIndex
CREATE INDEX "job_runs_job_type_status_idx" ON "job_runs"("job_type", "status");

-- AddForeignKey
ALTER TABLE "contact_batch_details" ADD CONSTRAINT "contact_batch_details_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_batch_details" ADD CONSTRAINT "contact_batch_details_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_files" ADD CONSTRAINT "transfer_files_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_parent_job_id_fkey" FOREIGN KEY ("parent_job_id") REFERENCES "job_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "HomeBlockKind" AS ENUM ('STAT', 'FEATURE', 'STEP', 'FAQ', 'LINK');

-- CreateEnum
CREATE TYPE "HomeMetric" AS ENUM ('MANUAL', 'STUDENTS', 'SUBJECTS', 'QUESTIONS', 'ATTEMPTS', 'PASS_RATE', 'AVERAGE_SCORE');

-- CreateTable
CREATE TABLE "home_page" (
    "id" TEXT NOT NULL DEFAULT 'home',
    "brandLabel" TEXT NOT NULL,
    "heroBadge" TEXT,
    "heroTitle" TEXT NOT NULL,
    "heroSubtitle" TEXT,
    "heroPrimaryLabel" TEXT NOT NULL,
    "heroPrimaryHref" TEXT NOT NULL,
    "heroSecondaryLabel" TEXT,
    "heroSecondaryHref" TEXT,
    "statsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "featuresEnabled" BOOLEAN NOT NULL DEFAULT true,
    "featuresTitle" TEXT NOT NULL,
    "featuresSubtitle" TEXT,
    "stepsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "stepsTitle" TEXT NOT NULL,
    "stepsSubtitle" TEXT,
    "faqEnabled" BOOLEAN NOT NULL DEFAULT true,
    "faqTitle" TEXT NOT NULL,
    "faqSubtitle" TEXT,
    "ctaEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ctaTitle" TEXT NOT NULL,
    "ctaBody" TEXT,
    "ctaButtonLabel" TEXT NOT NULL,
    "ctaButtonHref" TEXT NOT NULL,
    "footerTagline" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_blocks" (
    "id" TEXT NOT NULL,
    "kind" "HomeBlockKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "icon" TEXT,
    "metric" "HomeMetric" NOT NULL DEFAULT 'MANUAL',
    "value" TEXT,
    "href" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "home_blocks_kind_order_idx" ON "home_blocks"("kind", "order");

-- AddForeignKey
ALTER TABLE "home_page" ADD CONSTRAINT "home_page_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

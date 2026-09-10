-- Månadstak för fototolkning per användare. Skyddar de andra användarna från
-- att en enskild bränner den gemensamma AI-budgeten.
CREATE TABLE "PhotoQuota" (
    "clerkUserId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhotoQuota_pkey" PRIMARY KEY ("clerkUserId","month")
);

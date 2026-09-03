import { notFound } from "next/navigation";

import { requireAccount } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { UserModel } from "@/models";
import { PageHeader } from "@/components/layout/page-header";
import { ProfileForm } from "@/components/auth/profile-form";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const sessionUser = await requireAccount();

  await connectToDatabase();

  const raw = await UserModel.findOne({ _id: sessionUser.id })
    .select("name email role createdAt")
    .lean();

  // Was `findUniqueOrThrow`. The row is only missing if the account was deleted mid-session,
  // which is a 404 rather than a crash.
  if (!raw) notFound();

  const user = normalizeIds(raw) as unknown as {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: Date;
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile" description="Manage your account details and password." />
      <div className="space-y-6">
        <ProfileForm user={user} />
        <ChangePasswordForm />
      </div>
    </div>
  );
}

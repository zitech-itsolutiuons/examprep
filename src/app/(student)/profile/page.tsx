import { requireAccount } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ProfileForm } from "@/components/auth/profile-form";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const sessionUser = await requireAccount();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

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

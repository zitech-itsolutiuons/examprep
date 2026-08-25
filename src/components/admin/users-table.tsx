"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Power, Search, ShieldCheck, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, initialsOf } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

export type UserRow = {
  id: string;
  name: string | null;
  email: string;
  role: "STUDENT" | "ADMIN";
  isActive: boolean;
  createdAt: string;
  attemptCount: number;
};

type Filters = { q: string; role: string; status: string };

const ALL = "__all__";

export function UsersTable({
  users,
  currentUserId,
  filters,
  page,
  pageCount,
  total,
}: {
  users: UserRow[];
  currentUserId: string;
  filters: Filters;
  page: number;
  pageCount: number;
  total: number;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState(filters.q);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<{
    user: UserRow;
    patch: { role?: "STUDENT" | "ADMIN"; isActive?: boolean };
    title: string;
    description: string;
    label: string;
  } | null>(null);

  function navigate(next: Partial<Filters & { page: number }>) {
    const params = new URLSearchParams();
    const merged = { ...filters, page, ...next };
    if (merged.q) params.set("q", merged.q);
    if (merged.role && merged.role !== ALL) params.set("role", merged.role);
    if (merged.status && merged.status !== ALL) params.set("status", merged.status);
    if (merged.page && merged.page > 1) params.set("page", String(merged.page));
    const qs = params.toString();
    router.push(qs ? `/admin/users?${qs}` : "/admin/users");
  }

  async function applyPatch() {
    if (!pending) return;
    setBusyId(pending.user.id);
    const res = await fetch(`/api/admin/users/${pending.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pending.patch),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);

    if (!res.ok) {
      toast.error(data.error ?? "Could not update the user.");
      return;
    }

    toast.success(pending.label);
    setPending(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ q: query, page: 1 });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name or email, then press Enter…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>

        <Select
          value={filters.role || ALL}
          onValueChange={(value) => navigate({ role: value === ALL ? "" : value, page: 1 })}
        >
          <SelectTrigger className="lg:w-40">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All roles</SelectItem>
            <SelectItem value="STUDENT">Students</SelectItem>
            <SelectItem value="ADMIN">Admins</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.status || ALL}
          onValueChange={(value) => navigate({ status: value === ALL ? "" : value, page: 1 })}
        >
          <SelectTrigger className="lg:w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Deactivated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="No users match these filters"
          description="Try a different search term or clear the filters."
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {initialsOf(user.name ?? user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate text-sm font-medium">
                            {user.name ?? "—"}
                            {isSelf && (
                              <Badge variant="outline" className="text-[10px]">
                                You
                              </Badge>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge variant={user.role === "ADMIN" ? "solid" : "secondary"}>
                        {user.role === "ADMIN" ? "Admin" : "Student"}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge variant={user.isActive ? "success" : "destructive"}>
                        {user.isActive ? "Active" : "Deactivated"}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {user.attemptCount > 0 ? (
                        <Link
                          href={`/admin/attempts?userId=${user.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {user.attemptCount}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>

                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={isSelf || busyId === user.id}
                            aria-label={`Actions for ${user.email}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem
                            onSelect={() =>
                              setPending({
                                user,
                                patch: { role: user.role === "ADMIN" ? "STUDENT" : "ADMIN" },
                                title:
                                  user.role === "ADMIN"
                                    ? "Remove admin access?"
                                    : "Grant admin access?",
                                description:
                                  user.role === "ADMIN"
                                    ? `${user.email} will lose access to the admin panel and become a student.`
                                    : `${user.email} will be able to manage subjects, questions, and other users.`,
                                label:
                                  user.role === "ADMIN"
                                    ? "Role changed to student."
                                    : "Role changed to admin.",
                              })
                            }
                          >
                            <ShieldCheck />
                            {user.role === "ADMIN" ? "Make student" : "Make admin"}
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            destructive={user.isActive}
                            onSelect={() =>
                              setPending({
                                user,
                                patch: { isActive: !user.isActive },
                                title: user.isActive ? "Deactivate account?" : "Reactivate account?",
                                description: user.isActive
                                  ? `${user.email} will no longer be able to sign in. Their past attempts and results are kept.`
                                  : `${user.email} will be able to sign in again.`,
                                label: user.isActive ? "Account deactivated." : "Account reactivated.",
                              })
                            }
                          >
                            <Power />
                            {user.isActive ? "Deactivate" : "Reactivate"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {page} of {pageCount} · {total} user{total === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => navigate({ page: page - 1 })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => navigate({ page: page + 1 })}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.title ?? ""}
        description={pending?.description ?? ""}
        confirmLabel="Confirm"
        destructive={pending?.patch.isActive === false}
        loading={busyId === pending?.user.id}
        onConfirm={applyPatch}
      />
    </div>
  );
}

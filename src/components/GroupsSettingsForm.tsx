"use client";

import { z } from "zod";
import { useEffect, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { App, AppGroup } from "@/lib/app";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TrashIcon } from "@radix-ui/react-icons";
import { useUpsertApp } from "@/lib/hooks";

const formSchema = z.object({
  groups: z
    .array(
      z.object({
        name: z.string().min(1, { message: "Group name is required" }),
        // boolean per user, indexed to match allEmails. Using an array avoids
        // react-hook-form misinterpreting dots in email addresses as path separators.
        memberIndices: z.array(z.boolean()),
      }),
    )
    .superRefine((groups, ctx) => {
      const seen = new Set<string>();
      groups.forEach((group, index) => {
        if (seen.has(group.name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Group name must be unique",
            path: [index, "name"],
          });
        } else {
          seen.add(group.name);
        }
      });
    }),
});

type FormValues = z.infer<typeof formSchema>;

function groupToFormValues(
  group: AppGroup,
  allEmails: string[],
): FormValues["groups"][number] {
  return {
    name: group.name,
    memberIndices: allEmails.map((email) => group.memberEmails.includes(email)),
  };
}

export function GroupsSettingsForm({ app }: { app: App }) {
  const allEmails = useMemo(() => app.users.map((u) => u.email), [app.users]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      groups: (app.groups ?? []).map((g) => groupToFormValues(g, allEmails)),
    },
  });

  useEffect(() => {
    form.reset({
      groups: (app.groups ?? []).map((g) => groupToFormValues(g, allEmails)),
    });
  }, [app.groups, allEmails]);

  const { fields, remove, append } = useFieldArray({
    name: "groups",
    control: form.control,
  });

  const upsertApp = useUpsertApp();

  async function onSubmit(values: FormValues) {
    // Member emails absent from app.users (deleted users) are intentionally
    // dropped here — the form only tracks current users.
    const groups: AppGroup[] = values.groups.map((g) => ({
      name: g.name,
      memberEmails: allEmails.filter((_, i) => g.memberIndices[i]),
    }));
    await upsertApp.mutateAsync({ ...app, groups });
    toast.success("App group settings updated");
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {fields.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No groups configured. Add a group below.
          </p>
        )}

        {fields.map((field, groupIndex) => (
          <div key={field.id} className="rounded-md border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FormField
                control={form.control}
                name={`groups.${groupIndex}.name`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input placeholder="Group name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => remove(groupIndex)}
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </div>

            {app.users.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Members</Label>
                {app.users.map((user, userIndex) => (
                  <FormField
                    key={user.email}
                    control={form.control}
                    name={`groups.${groupIndex}.memberIndices.${userIndex}`}
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={field.name}
                            checked={field.value ?? false}
                            onChange={field.onChange}
                            className="h-4 w-4"
                          />
                          <label htmlFor={field.name} className="text-sm">
                            {user.firstName} {user.lastName} ({user.email})
                          </label>
                        </div>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            append({
              name: "",
              memberIndices: allEmails.map(() => false),
            })
          }
        >
          Add Group
        </Button>

        <div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving" : "Save"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

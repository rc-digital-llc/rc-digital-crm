import { useState } from "react";
import {
  Form,
  required,
  useDataProvider,
  useGetIdentity,
  useNotify,
  useRedirect,
} from "ra-core";
import { Create } from "@/components/admin/create";
import { SaveButton } from "@/components/admin/form";
import { FormToolbar } from "@/components/admin/simple-form";
import { TextInput } from "@/components/admin/text-input";
import { SelectInput } from "@/components/admin/select-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

import { analytics } from "@/providers/posthog";
import { leadSources } from "./leadStatuses";
import type { Lead } from "../types";

export const LeadCreate = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const { identity } = useGetIdentity();
  const redirect = useRedirect();
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const onSuccess = async (lead: Lead) => {
    // Log initial activity
    await dataProvider.create("lead_activities", {
      data: {
        lead_id: lead.id,
        sales_id: identity?.id,
        activity_type: "note",
        description: "Lead created manually",
        score_delta: 0,
      },
    });

    analytics.leadCreated({
      source: lead.source,
      utm_source: lead.utm_source,
    });

    notify("Lead created", { type: "success" });
    onClose();
    redirect("/leads");
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="lg:max-w-2xl overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
        <DialogHeader>
          <DialogTitle>Add New Lead</DialogTitle>
        </DialogHeader>
        <Create resource="leads" mutationOptions={{ onSuccess }}>
          <Form
            defaultValues={{
              sales_id: identity?.id,
              source: "manual",
              status: "new",
              lead_score: 0,
            }}
          >
            <div className="flex flex-col gap-4">
              {/* Identity */}
              <div className="grid grid-cols-2 gap-4">
                <TextInput
                  source="first_name"
                  label="First Name"
                  helperText={false}
                />
                <TextInput
                  source="last_name"
                  label="Last Name"
                  helperText={false}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <TextInput
                  source="email"
                  label="Email"
                  type="email"
                  helperText={false}
                />
                <TextInput source="phone" label="Phone" helperText={false} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <TextInput
                  source="company_name"
                  label="Company"
                  helperText={false}
                />
                <TextInput
                  source="job_title"
                  label="Job Title"
                  helperText={false}
                />
              </div>
              <TextInput
                source="linkedin_url"
                label="LinkedIn URL"
                helperText={false}
              />

              {/* Source */}
              <SelectInput
                source="source"
                label="Source"
                choices={leadSources}
                optionText="label"
                optionValue="value"
                validate={required()}
                helperText={false}
              />
              <TextInput
                source="source_detail"
                label="Source Detail"
                helperText={false}
              />

              {/* Notes */}
              <TextInput
                source="notes"
                label="Notes"
                multiline
                rows={3}
                helperText={false}
              />

              {/* Advanced UTM fields */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? (
                  <ChevronUp className="w-4 h-4 mr-1" />
                ) : (
                  <ChevronDown className="w-4 h-4 mr-1" />
                )}
                Advanced (UTM Tracking)
              </Button>

              {showAdvanced && (
                <div className="flex flex-col gap-4 pl-4 border-l-2 border-muted">
                  <div className="grid grid-cols-2 gap-4">
                    <TextInput
                      source="utm_source"
                      label="UTM Source"
                      helperText={false}
                    />
                    <TextInput
                      source="utm_medium"
                      label="UTM Medium"
                      helperText={false}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <TextInput
                      source="utm_campaign"
                      label="UTM Campaign"
                      helperText={false}
                    />
                    <TextInput
                      source="utm_term"
                      label="UTM Term"
                      helperText={false}
                    />
                    <TextInput
                      source="utm_content"
                      label="UTM Content"
                      helperText={false}
                    />
                  </div>
                  <TextInput
                    source="landing_page_url"
                    label="Landing Page URL"
                    helperText={false}
                  />
                  <TextInput
                    source="referrer_url"
                    label="Referrer URL"
                    helperText={false}
                  />
                </div>
              )}
            </div>
            <FormToolbar>
              <SaveButton label="Create Lead" />
            </FormToolbar>
          </Form>
        </Create>
      </DialogContent>
    </Dialog>
  );
};

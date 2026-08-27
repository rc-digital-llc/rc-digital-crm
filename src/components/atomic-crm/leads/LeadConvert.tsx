import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNotify, useRedirect, useRefresh } from "ra-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

import { supabase } from "../providers/supabase/supabase";
import { analytics } from "@/providers/posthog";
import { CrmErrorBoundary } from "../misc/CrmErrorBoundary";
import type { Lead } from "../types";

export const LeadConvert = ({
  open,
  onClose,
  lead,
}: {
  open: boolean;
  onClose: () => void;
  lead: Lead;
}) => {
  const [dealName, setDealName] = useState("");
  const [dealAmount, setDealAmount] = useState("");
  const [createDeal, setCreateDeal] = useState(false);
  const notify = useNotify();
  const redirect = useRedirect();
  const refresh = useRefresh();

  const { mutate, isPending, error } = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("convert_lead_to_contact", {
        p_lead_id: lead.id as number,
        p_deal_name: createDeal && dealName ? dealName : null,
        p_deal_amount:
          createDeal && dealAmount ? parseInt(dealAmount, 10) : null,
      });

      if (error) throw error;
      return data as {
        contact_id: number;
        deal_id: number | null;
        company_id: number | null;
      };
    },
    onSuccess: (result) => {
      const daysSinceCreation = Math.floor(
        (Date.now() - new Date(lead.created_at).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      analytics.leadConverted({
        lead_id: lead.id as number,
        contact_id: result.contact_id,
        deal_id: result.deal_id,
        time_to_convert_days: daysSinceCreation,
      });

      notify("Lead converted to contact successfully", { type: "success" });
      refresh();
      onClose();
      redirect(`/contacts/${result.contact_id}/show`);
    },
    onError: (err: Error) => {
      notify(`Conversion failed: ${err.message}`, { type: "error" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <CrmErrorBoundary fallbackTitle="Conversion form failed to load">
          <DialogHeader>
            <DialogTitle>Convert Lead to Contact</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Pre-filled lead info */}
            <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Name:</span>{" "}
                {lead.first_name} {lead.last_name}
              </p>
              {lead.email && (
                <p>
                  <span className="text-muted-foreground">Email:</span>{" "}
                  {lead.email}
                </p>
              )}
              {lead.company_name && (
                <p>
                  <span className="text-muted-foreground">Company:</span>{" "}
                  {lead.company_name}
                </p>
              )}
            </div>

            {/* Create deal option */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="createDeal"
                checked={createDeal}
                onChange={(e) => setCreateDeal(e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="createDeal">Also create a deal</Label>
            </div>

            {createDeal && (
              <div className="space-y-3 pl-4 border-l-2 border-muted">
                <div>
                  <Label htmlFor="dealName">Deal Name</Label>
                  <Input
                    id="dealName"
                    value={dealName}
                    onChange={(e) => setDealName(e.target.value)}
                    placeholder={`${lead.company_name || lead.first_name} - New Deal`}
                  />
                </div>
                <div>
                  <Label htmlFor="dealAmount">Deal Amount ($)</Label>
                  <Input
                    id="dealAmount"
                    type="number"
                    value={dealAmount}
                    onChange={(e) => setDealAmount(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">
                {(error as Error).message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={() => mutate()} disabled={isPending}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Convert to Contact
            </Button>
          </DialogFooter>
        </CrmErrorBoundary>
      </DialogContent>
    </Dialog>
  );
};

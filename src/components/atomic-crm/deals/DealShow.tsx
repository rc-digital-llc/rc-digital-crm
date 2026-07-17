import { useMutation } from "@tanstack/react-query";
import { isValid } from "date-fns";
import { Archive, ArchiveRestore, Calendar, DollarSign, Tag } from "lucide-react";
import {
  ShowBase,
  useDataProvider,
  useNotify,
  useRecordContext,
  useRedirect,
  useRefresh,
  useUpdate,
} from "ra-core";
import { DeleteButton } from "@/components/admin/delete-button";
import { EditButton } from "@/components/admin/edit-button";
import { ReferenceArrayField } from "@/components/admin/reference-array-field";
import { ReferenceField } from "@/components/admin/reference-field";
import { ReferenceManyField } from "@/components/admin/reference-many-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

import { CompanyAvatar } from "../companies/CompanyAvatar";
import { NoteCreate } from "../notes/NoteCreate";
import { NotesIterator } from "../notes/NotesIterator";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { ContactList } from "./ContactList";
import { findDealLabel } from "./deal";
import { formatISODateString } from "./dealUtils";
import { DealInsights } from "./DealInsights";

export const DealShow = ({ open, id }: { open: boolean; id?: string }) => {
  const redirect = useRedirect();
  const handleClose = () => {
    redirect("list", "deals");
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="lg:max-w-5xl p-0 overflow-y-auto max-h-9/10 top-1/20 translate-y-0 rounded-xl border border-border">
        {id ? (
          <ShowBase id={id}>
            <DealShowContent />
          </ShowBase>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

const stageColorMap: Record<string, { bg: string; text: string }> = {
  lead: { bg: "rgba(124, 94, 233, 0.12)", text: "#7C5EE9" },
  "discovery-call": { bg: "rgba(124, 94, 233, 0.12)", text: "#7C5EE9" },
  "proposal-sent": { bg: "rgba(0, 188, 212, 0.12)", text: "#00BCD4" },
  signed: { bg: "rgba(0, 188, 212, 0.12)", text: "#00BCD4" },
  "in-build": { bg: "rgba(255, 152, 0, 0.12)", text: "#FF9800" },
  review: { bg: "rgba(255, 152, 0, 0.12)", text: "#FF9800" },
  delivered: { bg: "rgba(76, 175, 80, 0.12)", text: "#4CAF50" },
  paid: { bg: "rgba(76, 175, 80, 0.12)", text: "#4CAF50" },
  opportunity: { bg: "rgba(124, 94, 233, 0.12)", text: "#7C5EE9" },
  "in-negociation": { bg: "rgba(0, 188, 212, 0.12)", text: "#00BCD4" },
  won: { bg: "rgba(76, 175, 80, 0.12)", text: "#4CAF50" },
  lost: { bg: "rgba(233, 69, 96, 0.12)", text: "#e94560" },
  delayed: { bg: "rgba(255, 152, 0, 0.12)", text: "#FF9800" },
};

const DealShowContent = () => {
  const { dealStages, dealCategories } = useConfigurationContext();
  const record = useRecordContext<Deal>();
  if (!record) return null;

  const stageColors = stageColorMap[record.stage] ?? {
    bg: "rgba(156, 163, 175, 0.12)",
    text: "#999",
  };

  return (
    <div>
      {record.archived_at ? <ArchivedTitle /> : null}

      {/* Header */}
      <div className="flex justify-between items-start p-6 pb-4">
        <div className="flex items-center gap-4">
          <ReferenceField
            source="company_id"
            reference="companies"
            link="show"
          >
            <CompanyAvatar />
          </ReferenceField>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{record.name}</h2>
            <div className="text-sm text-muted-foreground mt-0.5">
              <ReferenceField
                source="company_id"
                reference="companies"
                link="show"
              />
            </div>
          </div>
        </div>
        <div className={`flex gap-2 ${record.archived_at ? "" : "pr-8"}`}>
          {record.archived_at ? (
            <>
              <UnarchiveButton record={record} />
              <DeleteButton />
            </>
          ) : (
            <>
              <ArchiveButton record={record} />
              <EditButton />
            </>
          )}
        </div>
      </div>

      <Separator />

      {/* Two-column content */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
        {/* Left: Deal details - 60% */}
        <div className="lg:col-span-3 p-6 space-y-6">
          {/* Metadata cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetaField
              icon={<Calendar className="w-4 h-4 text-muted-foreground" />}
              label="Expected close"
              value={
                isValid(new Date(record.expected_closing_date))
                  ? formatISODateString(record.expected_closing_date)
                  : "Not set"
              }
              badge={
                new Date(record.expected_closing_date) < new Date() ? (
                  <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">Past</Badge>
                ) : null
              }
            />
            <MetaField
              icon={<DollarSign className="w-4 h-4 text-muted-foreground" />}
              label="Budget"
              value={record.amount.toLocaleString("en-US", {
                notation: "compact",
                style: "currency",
                currency: "USD",
                currencyDisplay: "narrowSymbol",
                minimumSignificantDigits: 3,
              })}
            />
            {record.category && (
              <MetaField
                icon={<Tag className="w-4 h-4 text-muted-foreground" />}
                label="Category"
                value={
                  dealCategories.find((c) => c.value === record.category)
                    ?.label ?? record.category
                }
              />
            )}
            <div>
              <span className="text-xs text-muted-foreground block mb-1">
                Stage
              </span>
              <span
                className="stage-pill"
                style={{
                  backgroundColor: stageColors.bg,
                  color: stageColors.text,
                }}
              >
                {findDealLabel(dealStages, record.stage)}
              </span>
            </div>
          </div>

          {!!record.contact_ids?.length && (
            <div>
              <span className="text-xs text-muted-foreground block mb-2">
                Contacts
              </span>
              <ReferenceArrayField
                source="contact_ids"
                reference="contacts_summary"
              >
                <ContactList />
              </ReferenceArrayField>
            </div>
          )}

          {record.description && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">
                Description
              </span>
              <p className="text-sm leading-6 whitespace-pre-line">
                {record.description}
              </p>
            </div>
          )}

          <DealInsights deal={record} />
        </div>

        {/* Right: Notes / Activity - 40% */}
        <div className="lg:col-span-2 border-l border-border p-6 bg-muted/30">
          <h3 className="text-base font-semibold mb-4">Activity</h3>
          <ReferenceManyField
            target="deal_id"
            reference="deal_notes"
            sort={{ field: "date", order: "DESC" }}
            empty={<NoteCreate reference={"deals"} />}
          >
            <NotesIterator reference="deals" />
          </ReferenceManyField>
        </div>
      </div>
    </div>
  );
};

const MetaField = ({
  icon,
  label,
  value,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  badge?: React.ReactNode;
}) => (
  <div>
    <span className="text-xs text-muted-foreground block mb-1">{label}</span>
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-sm font-medium">{value}</span>
      {badge}
    </div>
  </div>
);

const ArchivedTitle = () => (
  <div className="bg-orange-500 px-6 py-3 rounded-t-xl">
    <h3 className="text-sm font-bold text-white">Archived Deal</h3>
  </div>
);

const ArchiveButton = ({ record }: { record: Deal }) => {
  const [update] = useUpdate();
  const redirect = useRedirect();
  const notify = useNotify();
  const refresh = useRefresh();
  const handleClick = () => {
    update(
      "deals",
      {
        id: record.id,
        data: { archived_at: new Date().toISOString() },
        previousData: record,
      },
      {
        onSuccess: () => {
          redirect("list", "deals");
          notify("Deal archived", { type: "info", undoable: false });
          refresh();
        },
        onError: () => {
          notify("Error: deal not archived", { type: "error" });
        },
      },
    );
  };

  return (
    <Button
      onClick={handleClick}
      size="sm"
      variant="outline"
      className="flex items-center gap-2 h-9"
    >
      <Archive className="w-4 h-4" />
      Archive
    </Button>
  );
};

const UnarchiveButton = ({ record }: { record: Deal }) => {
  const dataProvider = useDataProvider();
  const redirect = useRedirect();
  const notify = useNotify();
  const refresh = useRefresh();

  const { mutate } = useMutation({
    mutationFn: () => dataProvider.unarchiveDeal(record),
    onSuccess: () => {
      redirect("list", "deals");
      notify("Deal unarchived", {
        type: "info",
        undoable: false,
      });
      refresh();
    },
    onError: () => {
      notify("Error: deal not unarchived", { type: "error" });
    },
  });

  const handleClick = () => {
    mutate();
  };

  return (
    <Button
      onClick={handleClick}
      size="sm"
      variant="outline"
      className="flex items-center gap-2 h-9"
    >
      <ArchiveRestore className="w-4 h-4" />
      Send back to the board
    </Button>
  );
};

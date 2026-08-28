import { CheckSquare } from "lucide-react";
import { Card } from "@/components/ui/card";

import { AddTask } from "../tasks/AddTask";
import { TasksListContent } from "../tasks/TasksListContent";

export const TasksList = () => {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center">
        <div className="mr-3 flex">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "rgba(124, 94, 233, 0.12)" }}
          >
            <CheckSquare className="w-4 h-4 text-[#7C5EE9]" />
          </div>
        </div>
        <h2 className="text-base font-semibold text-foreground flex-1">
          Upcoming Tasks
        </h2>
        <AddTask display="icon" selectContact />
      </div>
      <Card className="p-4 mb-2 border border-border shadow-sm">
        <TasksListContent />
      </Card>
    </div>
  );
};

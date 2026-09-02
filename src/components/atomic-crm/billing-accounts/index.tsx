import {
  BillingAccountList,
  BillingAccountListMobile,
} from "./BillingAccountList";
import { BillingAccountCreate } from "./BillingAccountCreate";
import { BillingAccountEdit } from "./BillingAccountEdit";
import { BillingAccountShow } from "./BillingAccountShow";

export { BillingAccountListMobile };

export default {
  list: BillingAccountList,
  create: BillingAccountCreate,
  edit: BillingAccountEdit,
  show: BillingAccountShow,
};

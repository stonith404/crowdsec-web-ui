import {
  ArrowCircleUpIcon,
  BellRingingIcon,
  BroadcastIcon,
  ChatTextIcon,
  DownloadSimpleIcon,
  EnvelopeSimpleIcon,
  GaugeIcon,
  ProhibitIcon,
  PulseIcon,
  ShieldWarningIcon,
  SirenIcon,
  TrendUpIcon,
  WebhooksLogoIcon,
  type Icon,
} from '@phosphor-icons/react';
import type { NotificationChannelType, NotificationDeliveryStatus, NotificationRuleType, NotificationSeverity } from '@/types';

export const CHANNEL_TYPES: Record<NotificationChannelType, { labelKey: string; icon: Icon }> = {
  ntfy: { labelKey: 'pages.notifications.channelTypes.ntfy', icon: BellRingingIcon },
  gotify: { labelKey: 'pages.notifications.channelTypes.gotify', icon: ChatTextIcon },
  email: { labelKey: 'pages.notifications.channelTypes.email', icon: EnvelopeSimpleIcon },
  mqtt: { labelKey: 'pages.notifications.channelTypes.mqtt', icon: BroadcastIcon },
  webhook: { labelKey: 'pages.notifications.channelTypes.webhook', icon: WebhooksLogoIcon },
};

export const RULE_TYPES: Record<NotificationRuleType, { labelKey: string; icon: Icon }> = {
  'alert-spike': { labelKey: 'pages.notifications.ruleTypes.alertSpike', icon: TrendUpIcon },
  'alert-threshold': { labelKey: 'pages.notifications.ruleTypes.alertThreshold', icon: GaugeIcon },
  'new-alert-decision': { labelKey: 'pages.notifications.ruleTypes.newAlertDecision', icon: SirenIcon },
  'new-cve': { labelKey: 'pages.notifications.ruleTypes.recentCve', icon: ShieldWarningIcon },
  'ip-ban': { labelKey: 'pages.notifications.ruleTypes.ipBan', icon: ProhibitIcon },
  'application-update': { labelKey: 'pages.notifications.ruleTypes.applicationUpdate', icon: ArrowCircleUpIcon },
  'crowdsec-update': { labelKey: 'pages.notifications.ruleTypes.crowdsecUpdate', icon: DownloadSimpleIcon },
  'lapi-availability': { labelKey: 'pages.notifications.ruleTypes.lapiAvailability', icon: PulseIcon },
};

export const SEVERITIES: Record<NotificationSeverity, { labelKey: string; variant: 'info' | 'warning' | 'error' }> = {
  info: { labelKey: 'pages.notifications.severityInfo', variant: 'info' },
  warning: { labelKey: 'pages.notifications.severityWarning', variant: 'warning' },
  critical: { labelKey: 'pages.notifications.severityCritical', variant: 'error' },
};

export const DELIVERY_STATUSES: Record<NotificationDeliveryStatus, { labelKey: string; variant: 'success' | 'warning' | 'error' }> = {
  delivered: { labelKey: 'pages.notifications.deliveryStatuses.delivered', variant: 'success' },
  failed: { labelKey: 'pages.notifications.deliveryStatuses.failed', variant: 'error' },
  skipped: { labelKey: 'pages.notifications.deliveryStatuses.skipped', variant: 'warning' },
};

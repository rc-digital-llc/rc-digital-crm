import { useEffect, useRef, useState } from "react";
import { Form, required, useLogin, useNotify } from "ra-core";
import type { SubmitHandler, FieldValues } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/admin/text-input";
import { Notification } from "@/components/admin/notification";
import { useConfigurationContext } from "@/components/atomic-crm/root/ConfigurationContext.tsx";
import { ReleaseSurfaceMetadata } from "@/components/atomic-crm/root/ReleaseSurfaceMetadata";
import { RELEASE_SURFACE_MARKER } from "@/components/atomic-crm/root/releaseSurface";
import { SSOAuthButton } from "./SSOAuthButton";

export const LoginPage = (props: { redirectTo?: string }) => {
  const {
    darkModeLogo,
    title,
    googleWorkplaceDomain,
    disableEmailPasswordAuthentication,
  } = useConfigurationContext();
  const { redirectTo } = props;
  const [loading, setLoading] = useState(false);
  const hasDisplayedRecoveryNotification = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const login = useLogin();
  const notify = useNotify();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const shouldNotify = searchParams.get("passwordRecoveryEmailSent") === "1";

    if (!shouldNotify || hasDisplayedRecoveryNotification.current) {
      return;
    }

    hasDisplayedRecoveryNotification.current = true;
    notify(
      "If you're a registered user, you should receive a password recovery email shortly.",
      {
        type: "success",
      },
    );

    searchParams.delete("passwordRecoveryEmailSent");
    const nextSearch = searchParams.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate, notify]);

  const handleSubmit: SubmitHandler<FieldValues> = (values) => {
    setLoading(true);
    login(values, redirectTo)
      .then(() => {
        setLoading(false);
      })
      .catch((error) => {
        setLoading(false);
        notify(
          typeof error === "string"
            ? error
            : typeof error === "undefined" || !error.message
              ? "ra.auth.sign_in_error"
              : error.message,
          {
            type: "error",
            messageArgs: {
              _:
                typeof error === "string"
                  ? error
                  : error && error.message
                    ? error.message
                    : undefined,
            },
          },
        );
      });
  };

  return (
    <div
      className="min-h-screen flex"
      data-surface-version={RELEASE_SURFACE_MARKER}
    >
      <ReleaseSurfaceMetadata canonicalPath="/" />
      <div className="relative grid w-full lg:grid-cols-2">
        {/* Left branding panel - Twenty-inspired dark panel */}
        <div className="relative hidden h-full flex-col p-10 text-white lg:flex overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, #1a1a2e 0%, #0f3460 50%, #1a1a2e 100%)",
            }}
          />
          {/* Decorative elements */}
          <div
            className="absolute top-1/4 right-[-100px] w-[300px] h-[300px] rounded-full opacity-10"
            style={{
              background: "radial-gradient(circle, #e94560, transparent)",
            }}
          />
          <div
            className="absolute bottom-1/4 left-[-50px] w-[200px] h-[200px] rounded-full opacity-8"
            style={{
              background: "radial-gradient(circle, #0f3460, transparent)",
            }}
          />

          <div className="relative z-20 flex items-center text-lg font-bold tracking-tight">
            <img className="h-8 mr-3" src={darkModeLogo} alt={title} />
            {title}
          </div>

          <div className="relative z-20 mt-auto space-y-4">
            <h2 className="text-3xl font-bold leading-tight">
              Manage your clients.
              <br />
              <span style={{ color: "#e94560" }}>Grow your agency.</span>
            </h2>
            <p className="text-base text-white/60 max-w-md">
              Track deals, manage projects, and deliver value to every client
              with RC Digital CRM.
            </p>
          </div>
        </div>

        {/* Right login form */}
        <div className="flex flex-col justify-center w-full p-6 lg:p-12">
          <div className="w-full space-y-8 lg:mx-auto lg:w-[380px]">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">
                Welcome back
              </h1>
              <p className="text-sm text-muted-foreground">
                Sign in to your RC Digital CRM account
              </p>
            </div>
            {disableEmailPasswordAuthentication ? null : (
              <Form className="space-y-6" onSubmit={handleSubmit}>
                <TextInput
                  label="Email"
                  source="email"
                  type="email"
                  validate={required()}
                />
                <TextInput
                  label="Password"
                  source="password"
                  type="password"
                  validate={required()}
                />
                <div className="flex flex-col gap-4">
                  <Button
                    type="submit"
                    className="cursor-pointer h-11 font-semibold"
                    style={{
                      background: "linear-gradient(135deg, #e94560, #c73651)",
                    }}
                    disabled={loading}
                  >
                    {loading ? "Signing in..." : "Sign in"}
                  </Button>
                </div>
              </Form>
            )}
            {googleWorkplaceDomain ? (
              <SSOAuthButton className="w-full" domain={googleWorkplaceDomain}>
                Sign in with Google Workplace
              </SSOAuthButton>
            ) : null}
            {disableEmailPasswordAuthentication ? null : (
              <Link
                to={"/forgot-password"}
                className="block text-sm text-center text-muted-foreground hover:text-foreground hover:underline transition-colors"
              >
                Forgot your password?
              </Link>
            )}
          </div>
        </div>
      </div>
      <Notification />
    </div>
  );
};

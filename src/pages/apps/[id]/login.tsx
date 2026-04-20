import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import LoginCard from "@/components/LoginCard";
import { DocsLink } from "@/components/DocsLink";
import Layout from "@/components/Layout";
import { useRouter } from "next/router";
import { useApp } from "@/lib/hooks";
import Head from "next/head";
import { useEffect, useState } from "react";

export default function Page() {
  const router = useRouter();
  const app = useApp(router.query.id as string);

  const [samlRequest, setSamlRequest] = useState("");
  useEffect(() => {
    const raw = router.query.SAMLRequest as string | undefined;
    if (!raw) {
      setSamlRequest("");
      return;
    }
    // HTTP-Redirect binding: SAMLRequest is base64(deflate(xml)), where base64 may use
    // URL-safe alphabet (-_ instead of +/). HTTP-POST binding (via sso/route.ts) sends
    // plain base64(xml) with no deflation.
    const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    (async () => {
      try {
        const ds = new DecompressionStream("deflate-raw");
        const writer = ds.writable.getWriter();
        writer.write(bytes);
        writer.close();
        setSamlRequest(await new Response(ds.readable).text());
      } catch {
        // Not deflated — HTTP-POST binding path
        setSamlRequest(new TextDecoder().decode(bytes));
      }
    })();
  }, [router.query.SAMLRequest]);

  return (
    <Layout>
      <Head>
        <title>Simulate Login | DummyIDP</title>
      </Head>

      <div className="px-8">
        <div className="mx-auto max-w-7xl">
          <Breadcrumb className="mt-8">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Home</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>Apps</BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href={`/apps/${app?.id}`}>
                  {app?.id}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>Simulate SAML Login</BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <h1 className="mt-2 text-3xl font-semibold">Simulate SAML login</h1>
          <p className="mt-1 text-muted-foreground">
            Simulate a SAML login as any user you've configured on this DummyIDP
            app.
            <DocsLink to="https://ssoready.com/docs/dummyidp#simulating-saml-logins" />
          </p>

          {app && (
            <LoginCard
              app={app}
              samlRequest={samlRequest}
              relayState={(router.query.RelayState as string) ?? ""}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}

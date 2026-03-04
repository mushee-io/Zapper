"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Tabs, TabKey } from "@/components/Tabs";
import { Section } from "@/components/Section";
import { shortAddr } from "@/lib/format";
import { loadStarkzap } from "@/lib/starkzapClient";

type Network = "sepolia" | "mainnet";
type Validator = { key: string; name: string; stakerAddress: string };

function useLocalStorage(key: string, initial: string) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v) setValue(v);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }, [key, value]);

  return [value, setValue] as const;
}

function formatNumber(x: any, dp = 4) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: dp });
}

function pickAprLike(pool: any): { label: string; value: string }[] {
  if (!pool) return [];
  const keys = [
    { k: "apr", label: "APR" },
    { k: "apy", label: "APY" },
    { k: "rewardApr", label: "Reward APR" },
    { k: "stakingApr", label: "Staking APR" },
    { k: "netApr", label: "Net APR" }
  ];

  const out: { label: string; value: string }[] = [];
  for (const it of keys) {
    if (pool[it.k] !== undefined && pool[it.k] !== null) {
      out.push({ label: it.label, value: `${formatNumber(pool[it.k], 2)}%` });
    }
  }

  const nestedCandidates = [
    ["metrics", "apr"],
    ["metrics", "apy"],
    ["stats", "apr"],
    ["stats", "apy"]
  ] as const;

  for (const path of nestedCandidates) {
    const v = path.reduce((acc: any, p: any) => (acc ? acc[p] : undefined), pool);
    const label = path.join(".").toUpperCase();
    if (v !== undefined && v !== null) out.push({ label, value: `${formatNumber(v, 2)}%` });
  }

  return out.slice(0, 3);
}

async function tryGetTokenBalance(wallet: any, pool: any) {
  if (!wallet) return null;

  const token = pool?.token;
  const tokenAddr = token?.address || token?.contractAddress;

  const attempts: Array<() => Promise<any>> = [
    async () => wallet.getTokenBalance?.(tokenAddr),
    async () => wallet.getBalance?.(tokenAddr),
    async () => wallet.balanceOf?.(tokenAddr),
    async () => wallet.getBalance?.()
  ];

  for (const fn of attempts) {
    try {
      const res = await fn();
      if (res !== undefined && res !== null) return res;
    } catch {}
  }

  return null;
}

export default function Page() {
  const [tab, setTab] = useState<TabKey>("stake");
  const [network, setNetwork] = useState<Network>("sepolia");

  const [sdk, setSdk] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);

  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [validators, setValidators] = useState<Validator[]>([]);
  const [validatorKey, setValidatorKey] = useState<string>("");
  const selectedValidator = useMemo(
    () => validators.find((v) => v.key === validatorKey),
    [validators, validatorKey]
  );

  const [pools, setPools] = useState<any[]>([]);
  const [poolAddr, setPoolAddr] = useState<string>("");
  const selectedPool = useMemo(
    () => pools.find((p) => p.poolContract === poolAddr),
    [pools, poolAddr]
  );

  const [amount, setAmount] = useState<string>("10");
  const [position, setPosition] = useState<any>(null);

  const [balance, setBalance] = useState<any>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [demoUrl, setDemoUrl] = useLocalStorage("mushee_demo_url", "");
  const [repoUrl, setRepoUrl] = useLocalStorage("mushee_repo_url", "");

  useEffect(() => {
    let alive = true;

    ;(async () => {
      setError("");
      setStatus("Loading SDK…");
      try {
        const mod = await loadStarkzap();
        const { StarkZap, mainnetValidators, sepoliaValidators } = mod;

        const s = new StarkZap({ network });
        if (!alive) return;

        setSdk(s);

        const preset = network === "mainnet" ? mainnetValidators : sepoliaValidators;
        const list = Object.entries(preset).map(([key, val]: any) => ({
          key,
          name: val.name,
          stakerAddress: val.stakerAddress
        })) as Validator[];

        setValidators(list);
        setValidatorKey(list[0]?.key ?? "");
        setPools([]);
        setPoolAddr("");
        setWallet(null);
        setPosition(null);
        setBalance(null);
        setStatus("");
      } catch (e: any) {
        setError(e?.message ?? "Failed to init Starkzap");
        setStatus("");
      }
    })();

    return () => {
      alive = false;
    };
  }, [network]);

  useEffect(() => {
    let alive = true;

    ;(async () => {
      if (!wallet || !selectedPool) return;
      setLoadingBalance(true);
      try {
        const b = await tryGetTokenBalance(wallet, selectedPool);
        if (!alive) return;
        setBalance(b);
      } catch {
        if (!alive) return;
        setBalance(null);
      } finally {
        if (alive) setLoadingBalance(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [wallet, selectedPool]);

  async function connect() {
    if (!sdk) return;
    setError("");
    setStatus("Connecting…");

    try {
      const mod = await loadStarkzap();
      const { OnboardStrategy } = mod;

      const onboard = await sdk.onboard({
        strategy: OnboardStrategy.Cartridge,
        deploy: "if_needed",
        cartridge: { policies: [] }
      });

      setWallet(onboard.wallet);
      setStatus("Connected ✅");
    } catch (e: any) {
      setError(e?.message ?? "Failed to connect wallet");
      setStatus("");
    }
  }

  async function loadPools() {
    if (!sdk || !selectedValidator) return;
    setError("");
    setStatus("Loading pools…");

    try {
      const ps = await sdk.getStakerPools(selectedValidator.stakerAddress);
      setPools(ps);

      const pick = ps.find((p: any) => p?.token?.symbol === "STRK") ?? ps[0];
      setPoolAddr(pick?.poolContract ?? "");

      setStatus("Pools ready ✅");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load pools");
      setStatus("");
    }
  }

  async function refreshPosition() {
    if (!wallet || !poolAddr) return;
    setError("");
    setStatus("Refreshing…");

    try {
      const pos = await wallet.getPoolPosition(poolAddr);
      setPosition(pos ?? null);
      setStatus("Up to date ✅");
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch position");
      setStatus("");
    }
  }

  async function stake() {
    if (!wallet || !selectedPool) return;
    setError("");
    setStatus("Staking…");

    try {
      const mod = await loadStarkzap();
      const { Amount } = mod;

      const amt = Amount.parse(amount, selectedPool.token);
      const tx = await wallet.stake(selectedPool.poolContract, amt);
      await tx.wait?.();

      setStatus("Staked ✅");
      await refreshPosition();
      setTab("dashboard");
    } catch (e: any) {
      setError(e?.message ?? "Stake failed");
      setStatus("");
    }
  }

  async function claim() {
    if (!wallet || !poolAddr) return;
    setError("");
    setStatus("Claiming…");

    try {
      const tx = await wallet.claimPoolRewards(poolAddr);
      await tx.wait?.();

      setStatus("Claimed ✅");
      await refreshPosition();
    } catch (e: any) {
      setError(e?.message ?? "Claim failed");
      setStatus("");
    }
  }

  async function exitIntent() {
    if (!wallet || !selectedPool) return;
    setError("");
    setStatus("Exit intent…");

    try {
      const mod = await loadStarkzap();
      const { Amount } = mod;

      const amt = Amount.parse(amount, selectedPool.token);
      const tx = await wallet.exitPoolIntent(selectedPool.poolContract, amt);
      await tx.wait?.();

      setStatus("Exit intent submitted ✅");
      await refreshPosition();
    } catch (e: any) {
      setError(e?.message ?? "Exit intent failed");
      setStatus("");
    }
  }

  const address = wallet?.address ? String(wallet.address) : "";
  const aprCards = pickAprLike(selectedPool);

  return (
    <main className="min-h-screen page-bg">
      <div className="container py-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill">Mushee</span>
            <span className="pill">UK incorporated</span>
            <span className="pill">Powered by Starkzap</span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-black/60">
            <span className="kbd">⌘</span>
            <span className="kbd">K</span>
            <span>soon: quick actions</span>
          </div>
        </div>

        <div className="mt-6 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">Mushee Yield</h1>
            <p className="text-black/60 mt-2 max-w-2xl">
              A clean staking experience: <span className="font-medium text-black">connect → stake → track</span>.
            </p>
            <p className="text-black/60 mt-2">
              Tagline: <span className="font-medium text-black">Make yield feel like a button.</span>
            </p>
          </div>

          <div className="card p-5 w-full md:w-[420px]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs text-black/60">Network</div>
                <select className="input mt-2" value={network} onChange={(e) => setNetwork(e.target.value as Network)}>
                  <option value="sepolia">Sepolia</option>
                  <option value="mainnet">Mainnet</option>
                </select>
              </div>

              <div className="min-w-0 text-right">
                <div className="text-xs text-black/60">Wallet</div>
                <div className="mt-2 text-sm font-medium truncate">{address ? shortAddr(address) : "Not connected"}</div>
              </div>
            </div>

            <div className="rule my-4" />

            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-black/60">{address ? "Ready." : "Connect to start."}</div>
              <button className={["btn", address ? "" : "btn-primary"].join(" ")} onClick={connect} disabled={!sdk}>
                {address ? "Connected" : "Connect"}
              </button>
            </div>

            {(status || error) && (
              <div className="mt-3 text-xs">
                {status ? <div className="text-black/60">{status}</div> : null}
                {error ? <div className="text-red-600">{error}</div> : null}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <Tabs active={tab} onChange={setTab} />
          <div className="text-xs text-black/60">
            <span className="badge">Demo-first flow</span>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Section title="Validator" subtitle="Pick a validator preset, then load pools." right={<span className="pill">{network}</span>}>
              <div className="space-y-3">
                <select className="input" value={validatorKey} onChange={(e) => setValidatorKey(e.target.value)}>
                  {validators.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.name}
                    </option>
                  ))}
                </select>

                <button className="btn btn-primary w-full" onClick={loadPools} disabled={!sdk || !selectedValidator}>
                  Load pools
                </button>

                <div className="text-xs text-black/60">
                  {selectedValidator?.stakerAddress ? (
                    <>
                      staker: <span className="font-medium">{shortAddr(selectedValidator.stakerAddress)}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            </Section>

            <Section
              title="Stake"
              subtitle="Simple defaults for a clean demo."
              right={
                <span className="badge">
                  Balance: {loadingBalance ? "loading…" : balance !== null ? String(balance) : "—"}
                </span>
              }
            >
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <input className="input col-span-2" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      const n = Number(balance);
                      if (Number.isFinite(n) && n > 0) setAmount(String(n));
                    }}
                    disabled={loadingBalance || balance === null}
                    title="Best-effort MAX (depends on wallet/SDK balance support)"
                  >
                    Max
                  </button>
                </div>

                <button className="btn btn-primary w-full" onClick={stake} disabled={!wallet || !selectedPool}>
                  Stake
                </button>

                <div className="flex gap-2">
                  <button className="btn w-full" onClick={claim} disabled={!wallet || !poolAddr}>
                    Claim
                  </button>
                  <button className="btn w-full" onClick={exitIntent} disabled={!wallet || !selectedPool}>
                    Exit intent
                  </button>
                </div>
              </div>
            </Section>
          </div>

          <div className="lg:col-span-2">
            {tab === "stake" ? (
              <Section
                title="Pools"
                subtitle="Select a pool and stake."
                right={
                  <button className="btn" onClick={refreshPosition} disabled={!wallet || !poolAddr}>
                    Refresh
                  </button>
                }
              >
                <div className="space-y-4">
                  <select className="input" value={poolAddr} onChange={(e) => setPoolAddr(e.target.value)} disabled={!pools.length}>
                    {!pools.length ? (
                      <option value="">Load pools first</option>
                    ) : (
                      pools.map((p: any) => (
                        <option key={p.poolContract} value={p.poolContract}>
                          {(p?.token?.symbol ?? "TOKEN") + " — " + shortAddr(p.poolContract)}
                        </option>
                      ))
                    )}
                  </select>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Mini label="Token" value={selectedPool?.token?.symbol ?? "—"} />
                    <Mini label="Pool" value={poolAddr ? shortAddr(poolAddr) : "—"} />
                    <Mini label="Status" value={pools.length ? "ready" : "load pools"} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {(aprCards.length ? aprCards : [{ label: "APR", value: "—" }]).map((m) => (
                      <Mini key={m.label} label={m.label} value={m.value} />
                    ))}
                  </div>

                  <div className="text-xs text-black/60">
                    Metrics auto-detect: if the SDK exposes APR/APY fields, we display them.
                  </div>
                </div>
              </Section>
            ) : null}

            {tab === "dashboard" ? (
              <Section
                title="Dashboard"
                subtitle="Wallet, pool, and position in one screen."
                right={
                  <button className="btn" onClick={refreshPosition} disabled={!wallet || !poolAddr}>
                    Refresh
                  </button>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Mini label="Wallet" value={address ? shortAddr(address) : "—"} />
                  <Mini label="Pool" value={poolAddr ? shortAddr(poolAddr) : "—"} />
                  <Mini label="Token" value={selectedPool?.token?.symbol ?? "—"} />
                </div>

                <div className="mt-5 card p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Position (raw)</div>
                    <span className="pill">MVP</span>
                  </div>
                  <pre className="mt-3 text-xs overflow-auto bg-black/[0.03] p-3 rounded-xl">
{JSON.stringify(position ?? { note: "Stake first, then refresh." }, null, 2)}
                  </pre>
                </div>
              </Section>
            ) : null}

            {tab === "links" ? (
              <Section title="Links" subtitle="Paste your real demo + repo once deployed (saved locally).">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="card p-4">
                    <div className="text-sm font-semibold">Mushee</div>
                    <p className="text-sm text-black/60 mt-1">Project site</p>
                    <a className="btn mt-3 w-full" href="https://mushee.xyz/" target="_blank" rel="noreferrer">
                      Open mushee.xyz ↗
                    </a>
                  </div>

                  <div className="card p-4">
                    <div className="text-sm font-semibold">Starkzap docs</div>
                    <p className="text-sm text-black/60 mt-1">Quick start + SDK patterns</p>
                    <a className="btn mt-3 w-full" href="https://docs.starknet.io/build/starkzap/quick-start" target="_blank" rel="noreferrer">
                      Open docs ↗
                    </a>
                  </div>

                  <div className="card p-4 md:col-span-2">
                    <div className="text-sm font-semibold">Your submission URLs</div>
                    <p className="text-sm text-black/60 mt-1">Paste these once you deploy and push to GitHub.</p>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-black/60">Demo URL (Vercel)</label>
                        <input className="input mt-2" value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} placeholder="https://your-app.vercel.app" />
                        <button className="btn mt-2 w-full" onClick={() => demoUrl && window.open(demoUrl, "_blank")} disabled={!demoUrl}>
                          Open demo ↗
                        </button>
                      </div>

                      <div>
                        <label className="text-xs text-black/60">Repo URL (GitHub)</label>
                        <input className="input mt-2" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/you/mushee-yield" />
                        <button className="btn mt-2 w-full" onClick={() => repoUrl && window.open(repoUrl, "_blank")} disabled={!repoUrl}>
                          Open repo ↗
                        </button>
                      </div>
                    </div>

                    <div className="rule my-4" />

                    <div className="text-xs text-black/60">
                      Submit PR to{" "}
                      <a className="underline" href="https://github.com/keep-starknet-strange/awesome-starkzap" target="_blank" rel="noreferrer">
                        awesome-starkzap
                      </a>{" "}
                      after you have repo + demo.
                    </div>
                  </div>
                </div>
              </Section>
            ) : null}
          </div>
        </div>

        <footer className="mt-10 text-sm text-black/60">
          <div className="rule mb-5" />
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <span className="font-medium text-black">Mushee</span> — UK incorporated.{" "}
              <span className="text-black">Make yield feel like a button.</span>
            </div>
            <div className="text-xs">Built with Starkzap • Clean UX • Demo-first</div>
          </div>
        </footer>
      </div>
    </main>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-black/60">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

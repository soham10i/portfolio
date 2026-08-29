---
title: Diffusion models from scratch
summary: The complete derivation — forward marginal, reverse posterior, the variational bound, and the proof that predicting the image, the noise and the score are one objective. Every theorem proved, then checked numerically on a five-step chain where all three parameterisations return the identical number.
topic: Generative models
tags: diffusion, DDPM, variational inference, score matching, guidance
updated: 2026-08-29T00:00:00.000Z
---

A diffusion model learns to generate by learning to undo damage. Take a real image, add a
little Gaussian noise, add a little more, and keep going until nothing of the original
survives. Then train a network to walk that chain backwards. Sampling is running the learned
reverse walk starting from pure noise.

That sentence is the whole idea. Everything below is the work of turning it into something
you can train — and the reason it takes six theorems is that the object you actually want,
the reverse transition, is intractable. The entire construction is a sequence of moves for
replacing it with something that is not.

This note proves each step rather than quoting it, then runs the result on a five-step chain
small enough to check by hand. **The numerical section is the point**: at the end, three
objectives that look completely different — predict the image, predict the noise, predict
the score — return the identical number, $0.191327$, on the same frame.

<div class="aside">
<strong>What you need going in.</strong> Gaussian densities, Bayes' rule, and Jensen's
inequality. Everything else — the sum of two Gaussians, completing the square in an
exponent, the KL between two Gaussians, Tweedie's formula — is derived here.
</div>

## Where the idea comes from

The construction is older than the image models that made it famous. Sohl-Dickstein and
colleagues proposed it in 2015 from an argument in non-equilibrium statistical physics: a
diffusion process gradually destroys structure in *any* smooth distribution, and if each step
is small enough, the reverse of that step has the same functional form as the forward one.
That single fact is what makes the problem tractable — it converts density modelling, which
needs an intractable normalising constant, into **regression**, which does not.

Their framing gives the two properties the method still trades on:

- **Tractability.** Each individual step is a Gaussian, so nothing needs to be normalised.
- **Flexibility.** A diffusion process exists for any smooth target distribution, so the model
  is not confined to a parametric family the way a VAE's decoder or a normalising flow's
  invertible map is.

<figure>
<svg viewBox="0 0 700 176" role="img" aria-label="Forward and reverse Markov chains between x0 and xT">
<defs>
<marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker>
<marker id="ar2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--p)"/></marker>
</defs>
<g font-family="ui-monospace, monospace" font-size="13">
<circle cx="60"  cy="88" r="26" fill="var(--surf2)" stroke="currentColor" stroke-opacity=".45"/>
<circle cx="205" cy="88" r="26" fill="var(--surf2)" stroke="currentColor" stroke-opacity=".35"/>
<circle cx="350" cy="88" r="26" fill="var(--surf2)" stroke="currentColor" stroke-opacity=".28"/>
<circle cx="495" cy="88" r="26" fill="var(--surf2)" stroke="currentColor" stroke-opacity=".22"/>
<circle cx="640" cy="88" r="26" fill="var(--surf2)" stroke="currentColor" stroke-opacity=".18"/>
<text x="60"  y="93" text-anchor="middle" fill="currentColor">x₀</text>
<text x="205" y="93" text-anchor="middle" fill="currentColor">x₁</text>
<text x="350" y="93" text-anchor="middle" fill="currentColor">x₂</text>
<text x="495" y="93" text-anchor="middle" fill="currentColor">…</text>
<text x="640" y="93" text-anchor="middle" fill="currentColor">x_T</text>
<g stroke="currentColor" stroke-opacity=".55" fill="none" marker-end="url(#ar)">
<path d="M88 70 Q132 42 176 70"/><path d="M233 70 Q277 42 321 70"/>
<path d="M378 70 Q422 42 466 70"/><path d="M523 70 Q567 42 611 70"/>
</g>
<g stroke="var(--p)" fill="none" marker-end="url(#ar2)">
<path d="M612 106 Q568 134 524 106"/><path d="M467 106 Q423 134 379 106"/>
<path d="M322 106 Q278 134 234 106"/><path d="M177 106 Q133 134 89 106"/>
</g>
<text x="350" y="26" text-anchor="middle" fill="currentColor" fill-opacity=".72" font-size="12">forward q — fixed schedule, adds noise, no parameters</text>
<text x="350" y="164" text-anchor="middle" fill="var(--p)" font-size="12">reverse p_θ — learned, removes noise, one network</text>
</g>
</svg>
<figcaption>Two chains over the same variables. Everything that is learned lives in the lower one — and, as Theorem 5 shows, only in its mean.</figcaption>
</figure>

## Definitions and notation

<div class="defn">
<span class="lbl">Definition 1 — the forward process</span>
<p>Fix a <strong>variance schedule</strong> $\beta_1,\dots,\beta_T$ with $0 \lt \beta_t \lt 1$. The forward process is the Markov chain</p>
<p>$$q(x_t \mid x_{t-1}) = \mathcal{N}\!\left(x_t;\ \sqrt{1-\beta_t}\,x_{t-1},\ \beta_t \mathbf{I}\right),\qquad q(x_{1:T}\mid x_0)=\prod_{t=1}^{T} q(x_t\mid x_{t-1}).$$</p>
<p>Write $\alpha_t = 1-\beta_t$ and $\bar{\alpha}_t = \prod_{s=1}^{t}\alpha_s$ throughout.</p>
</div>

<div class="defn">
<span class="lbl">Definition 2 — the reverse process</span>
<p>$$p_\theta(x_{t-1}\mid x_t) = \mathcal{N}\!\left(x_{t-1};\ \mu_\theta(x_t,t),\ \Sigma_\theta(x_t,t)\right),\qquad p(x_T)=\mathcal{N}(0,\mathbf{I}).$$</p>
<p>One network is shared across all $T$ steps; the timestep enters as an embedding.</p>
</div>

The scaling $\sqrt{1-\beta_t}$ is not decoration. If $x_{t-1}$ has unit variance then

$$\operatorname{Var}(x_t) = (1-\beta_t)\cdot 1 + \beta_t = 1,$$

so the chain is **variance preserving** — signal is attenuated and noise substituted for it in
equal measure, rather than noise being piled on top. This is why data is normalised to roughly
unit variance first, and why $x_T$ can be compared to a standard normal at all.

## The forward marginal in closed form

Training would be hopeless if reaching $x_t$ meant simulating $t$ steps. It does not.

<div class="thm">
<span class="lbl">Lemma 1 — sum of independent Gaussians</span>
<p>If $u\sim\mathcal{N}(0,\sigma_1^2\mathbf{I})$ and $v\sim\mathcal{N}(0,\sigma_2^2\mathbf{I})$ are independent, then $u+v\sim\mathcal{N}(0,(\sigma_1^2+\sigma_2^2)\mathbf{I})$.</p>
</div>

<div class="thm">
<span class="lbl">Theorem 1 — closed-form forward marginal</span>
<p>$$q(x_t\mid x_0) = \mathcal{N}\!\left(x_t;\ \sqrt{\bar{\alpha}_t}\,x_0,\ (1-\bar{\alpha}_t)\mathbf{I}\right),$$</p>
<p>equivalently $x_t = \sqrt{\bar{\alpha}_t}\,x_0 + \sqrt{1-\bar{\alpha}_t}\,\epsilon$ with $\epsilon\sim\mathcal{N}(0,\mathbf{I})$.</p>
</div>

<div class="proof">
<span class="lbl">Proof</span>
<p>Substitute one step into the next:</p>
<p>$$\begin{aligned}
x_t &= \sqrt{\alpha_t}\,x_{t-1} + \sqrt{1-\alpha_t}\,\epsilon_t \\
&= \sqrt{\alpha_t}\left(\sqrt{\alpha_{t-1}}\,x_{t-2} + \sqrt{1-\alpha_{t-1}}\,\epsilon_{t-1}\right) + \sqrt{1-\alpha_t}\,\epsilon_t \\
&= \sqrt{\alpha_t\alpha_{t-1}}\,x_{t-2} \;+\; \underbrace{\sqrt{\alpha_t(1-\alpha_{t-1})}\,\epsilon_{t-1} + \sqrt{1-\alpha_t}\,\epsilon_t}_{\text{independent, both zero-mean}}.
\end{aligned}$$</p>
<p>By Lemma 1 the bracketed part is one Gaussian whose variance is the sum</p>
<p>$$\alpha_t(1-\alpha_{t-1}) + (1-\alpha_t) \;=\; \alpha_t - \alpha_t\alpha_{t-1} + 1 - \alpha_t \;=\; 1-\alpha_t\alpha_{t-1},$$</p>
<p>so $x_t = \sqrt{\alpha_t\alpha_{t-1}}\,x_{t-2} + \sqrt{1-\alpha_t\alpha_{t-1}}\,\bar\epsilon$ — the same form one step deeper, with $\alpha_t$ replaced by the running product. Induction down to $x_0$ replaces it by $\bar\alpha_t$. <span class="qed"></span></p>
</div>

<div class="aside">
<strong>Why this one theorem carries the method.</strong> Training can pick a random $t$, draw
one $\epsilon$, and construct $x_t$ in a single line. No simulation, no sequential dependency —
every timestep of every example is an independent training pair, so the whole thing
parallelises. And if $\bar{\alpha}_T\approx 0$ then $q(x_T\mid x_0)\approx\mathcal{N}(0,\mathbf{I})$
<em>regardless of $x_0$</em>, which is what licenses starting the sampler from noise.
</div>

## The reverse posterior

The object we want is $q(x_{t-1}\mid x_t)$, and it is intractable: by Bayes it needs
$q(x_{t-1})$, a marginal over the entire data distribution. The move that rescues the
construction is to condition on $x_0$ as well — available during training, and enough to make
everything Gaussian again.

<div class="thm">
<span class="lbl">Theorem 2 — the posterior conditioned on x₀</span>
<p>$$q(x_{t-1}\mid x_t,x_0)=\mathcal{N}\!\left(x_{t-1};\ \tilde\mu_t(x_t,x_0),\ \tilde\beta_t\mathbf{I}\right)$$</p>
<p>$$\tilde\mu_t(x_t,x_0) = \frac{\sqrt{\bar{\alpha}_{t-1}}\,\beta_t}{1-\bar{\alpha}_t}\,x_0 \;+\; \frac{\sqrt{\alpha_t}\,(1-\bar{\alpha}_{t-1})}{1-\bar{\alpha}_t}\,x_t, \qquad \tilde\beta_t = \frac{1-\bar{\alpha}_{t-1}}{1-\bar{\alpha}_t}\,\beta_t.$$</p>
</div>

<div class="proof">
<span class="lbl">Proof</span>
<p>By Bayes' rule and the Markov property $q(x_t\mid x_{t-1},x_0)=q(x_t\mid x_{t-1})$,</p>
<p>$$q(x_{t-1}\mid x_t,x_0)=\frac{q(x_t\mid x_{t-1})\,q(x_{t-1}\mid x_0)}{q(x_t\mid x_0)}.$$</p>
<p>All three factors are known Gaussians — the first from Definition 1, the other two from Theorem 1. The denominator does not involve $x_{t-1}$, so it goes into the normalising constant; keep only the exponent terms in $x_{t-1}$:</p>
<p>$$\propto \exp\left(-\frac{(x_t-\sqrt{\alpha_t}x_{t-1})^2}{2\beta_t} - \frac{(x_{t-1}-\sqrt{\bar{\alpha}_{t-1}}x_0)^2}{2(1-\bar{\alpha}_{t-1})}\right).$$</p>
<p>Expanding and collecting powers of $x_{t-1}$ gives $\exp\!\big(-\tfrac12[A\,x_{t-1}^2 - 2B\,x_{t-1}] + C\big)$ with</p>
<p>$$A = \frac{\alpha_t}{\beta_t}+\frac{1}{1-\bar{\alpha}_{t-1}}, \qquad B = \frac{\sqrt{\alpha_t}}{\beta_t}x_t + \frac{\sqrt{\bar{\alpha}_{t-1}}}{1-\bar{\alpha}_{t-1}}x_0.$$</p>
<p>A quadratic in the exponent <em>is</em> a Gaussian; matching against $-\frac{(x-\mu)^2}{2\sigma^2}$ gives $\sigma^2=1/A$ and $\mu=B/A$. Evaluate $A$:</p>
<p>$$A = \frac{\alpha_t(1-\bar{\alpha}_{t-1})+\beta_t}{\beta_t(1-\bar{\alpha}_{t-1})}, \qquad \alpha_t-\alpha_t\bar{\alpha}_{t-1}+1-\alpha_t = 1-\bar{\alpha}_t,$$</p>
<p>using $\beta_t = 1-\alpha_t$ and $\bar\alpha_t=\alpha_t\bar\alpha_{t-1}$. Hence $A=\frac{1-\bar{\alpha}_t}{\beta_t(1-\bar{\alpha}_{t-1})}$, which inverts to $\tilde\beta_t$, and $B/A$ is $\tilde\mu_t$ as stated. <span class="qed"></span></p>
</div>

Read the mean rather than just accepting it. It is a **weighted blend of where you came from
and where you are** — and the weights do not sum to one, so it is not an interpolation. Early
in the chain ($\bar{\alpha}_{t-1}$ near 1) the $x_t$ term dominates and the step barely moves;
late in the chain the $x_0$ term takes over. And $\tilde\beta_t \lt \beta_t$ always, because
knowing $x_0$ genuinely tells you something about where $x_{t-1}$ was.

### Eliminating x₀

$\tilde\mu_t$ needs $x_0$, which the sampler does not have. But Theorem 1 inverts:

$$x_0 = \frac{1}{\sqrt{\bar{\alpha}_t}}\left(x_t - \sqrt{1-\bar{\alpha}_t}\,\epsilon\right).$$

<div class="thm">
<span class="lbl">Theorem 3 — the noise form of the posterior mean</span>
<p>$$\tilde\mu_t = \frac{1}{\sqrt{\alpha_t}}\left(x_t - \frac{\beta_t}{\sqrt{1-\bar{\alpha}_t}}\,\epsilon\right).$$</p>
</div>

<div class="proof">
<span class="lbl">Proof</span>
<p>Substitute the expression for $x_0$ into Theorem 2 and collect the $x_t$ terms. Their coefficient is</p>
<p>$$\frac{\sqrt{\bar{\alpha}_{t-1}}\beta_t}{(1-\bar{\alpha}_t)\sqrt{\bar{\alpha}_t}} + \frac{\sqrt{\alpha_t}(1-\bar{\alpha}_{t-1})}{1-\bar{\alpha}_t} = \frac{\beta_t}{(1-\bar{\alpha}_t)\sqrt{\alpha_t}} + \frac{\alpha_t(1-\bar{\alpha}_{t-1})}{(1-\bar{\alpha}_t)\sqrt{\alpha_t}},$$</p>
<p>where the first term used $\sqrt{\bar\alpha_{t-1}}/\sqrt{\bar\alpha_t}=1/\sqrt{\alpha_t}$. The numerators sum to $\beta_t+\alpha_t-\bar{\alpha}_t = 1-\bar{\alpha}_t$, cancelling the denominator and leaving $1/\sqrt{\alpha_t}$. The $\epsilon$ coefficient is what remains, $-\beta_t/(\sqrt{\alpha_t}\sqrt{1-\bar{\alpha}_t})$. <span class="qed"></span></p>
</div>

**The only unknown left is $\epsilon$.** Predict the noise that was added and you know the
reverse mean exactly. That is the pivot the rest of the method turns on.

## The variational bound

Why is predicting $\epsilon$ the *right* objective rather than merely a convenient one? Because
it drops out of maximising a lower bound on the likelihood.

<div class="thm">
<span class="lbl">Theorem 4 — the ELBO decomposition</span>
<p>$$\begin{aligned}
\mathbb{E}\!\left[-\log p_\theta(x_0)\right] \;\le\; \mathbb{E}_q\Big[\;
&\underbrace{\mathrm{KL}\big(q(x_T|x_0)\,\|\,p(x_T)\big)}_{L_T} \\[3pt]
+\;&\sum_{t=2}^{T}\underbrace{\mathrm{KL}\big(q(x_{t-1}|x_t,x_0)\,\|\,p_\theta(x_{t-1}|x_t)\big)}_{L_{t-1}} \\[3pt]
+\;&\underbrace{\big(-\log p_\theta(x_0|x_1)\big)}_{L_0}\;\Big].
\end{aligned}$$</p>
</div>

<div class="proof">
<span class="lbl">Proof sketch</span>
<p>Write $p_\theta(x_0)=\int p_\theta(x_{0:T})\,dx_{1:T}$, multiply and divide by $q(x_{1:T}|x_0)$, and apply Jensen:</p>
<p>$$-\log p_\theta(x_0) = -\log \mathbb{E}_q\!\left[\frac{p_\theta(x_{0:T})}{q(x_{1:T}|x_0)}\right] \le \mathbb{E}_q\!\left[-\log\frac{p_\theta(x_{0:T})}{q(x_{1:T}|x_0)}\right].$$</p>
<p>Expanding both products and regrouping term by term gives the stated form. The regrouping is the part worth care. The naive expansion pairs $q(x_t|x_{t-1})$ against $p_\theta$, which produces a bound whose Monte-Carlo estimate depends on <em>two</em> random variables per term and is correspondingly noisy. Rewriting $q(x_t|x_{t-1}) = q(x_{t-1}|x_t,x_0)\,q(x_t|x_0)/q(x_{t-1}|x_0)$ — Theorem 2 — telescopes the ratio and leaves each term an expectation over at most one variable. That is the lower-variance form above, and it is the one everyone trains. <span class="qed"></span></p>
</div>

$L_T$ contains no parameters: the forward process is fixed and $p(x_T)$ is a fixed Gaussian, so
it is a constant. $L_0$ is a single reconstruction term. **All the learning is in the $L_{t-1}$
terms**, and each is a KL between two Gaussians.

<div class="thm">
<span class="lbl">Lemma 2 — KL between equal-variance Gaussians</span>
<p>$$\mathrm{KL}\big(\mathcal{N}(\tilde\mu,\sigma^2\mathbf{I})\,\|\,\mathcal{N}(\mu_\theta,\sigma^2\mathbf{I})\big) = \frac{\|\tilde\mu-\mu_\theta\|^2}{2\sigma^2}.$$</p>
</div>

<div class="proof">
<span class="lbl">Proof</span>
<p>For general Gaussians in $d$ dimensions, $\mathrm{KL} = \tfrac12\big[\log\frac{|\Sigma_2|}{|\Sigma_1|} - d + \operatorname{tr}(\Sigma_2^{-1}\Sigma_1) + (\mu_2-\mu_1)^\top\Sigma_2^{-1}(\mu_2-\mu_1)\big]$. With $\Sigma_1=\Sigma_2=\sigma^2\mathbf{I}$ the log-determinant ratio is $0$ and $\operatorname{tr}(\Sigma_2^{-1}\Sigma_1)=d$, cancelling the $-d$. Only the quadratic form survives. <span class="qed"></span></p>
</div>

This is why the variance is *fixed* rather than learned in the original formulation: setting
$\Sigma_\theta = \tilde\beta_t\mathbf{I}$ makes Lemma 2 apply and turns the KL into a squared
error. Improved DDPM later learns it back — see the schedules section.

## Three objectives that are one objective

<div class="thm">
<span class="lbl">Theorem 5 — equivalence of the three parameterisations</span>
<p>Minimising $L_{t-1}$ is equivalent to minimising any one of:</p>
<p>$$\text{(a)}\quad \frac{\bar\alpha_{t-1}\,\beta_t^2}{2\tilde\beta_t(1-\bar\alpha_t)^2}\,\big\|\hat{x}_\theta(x_t,t)-x_0\big\|^2$$</p>
<p>$$\text{(b)}\quad \frac{\beta_t^2}{2\tilde\beta_t\,\alpha_t(1-\bar{\alpha}_t)}\,\big\|\hat\epsilon_\theta(x_t,t)-\epsilon\big\|^2$$</p>
<p>$$\text{(c)}\quad \frac{\beta_t^2}{2\tilde\beta_t\,\alpha_t}\,\big\|s_\theta(x_t,t)-\nabla_{x_t}\log q(x_t)\big\|^2$$</p>
<p>They differ only by a fixed, $t$-dependent constant and a deterministic change of variable.</p>
</div>

<div class="proof">
<span class="lbl">Proof</span>
<p><strong>(a) ⇔ (b).</strong> By Lemma 2, $L_{t-1}=\|\tilde\mu_t-\mu_\theta\|^2/2\tilde\beta_t$. Writing both means in $x_0$-form (Theorem 2), the $x_t$ terms are identical and cancel, leaving $\tilde\mu-\mu_\theta = \frac{\sqrt{\bar\alpha_{t-1}}\beta_t}{1-\bar\alpha_t}(x_0-\hat x_\theta)$; squaring and dividing by $2\tilde\beta_t$ gives (a). Writing them instead in $\epsilon$-form (Theorem 3), the $x_t$ terms again cancel, leaving</p>
<p>$$\tilde\mu_t-\mu_\theta = \frac{1}{\sqrt{\alpha_t}}\cdot\frac{\beta_t}{\sqrt{1-\bar{\alpha}_t}}\,(\hat\epsilon_\theta-\epsilon),$$</p>
<p>which gives (b). Both are the same $L_{t-1}$, so (a) and (b) are the same objective.</p>
<p><strong>(b) ⇔ (c), via Tweedie's formula.</strong> For a Gaussian $z\sim\mathcal{N}(\mu_z,\Sigma_z)$, the posterior mean of the parameter satisfies $\mathbb{E}[\mu_z\mid z] = z + \Sigma_z\nabla_z\log p(z)$. Applying this to $q(x_t\mid x_0)=\mathcal{N}(\sqrt{\bar\alpha_t}x_0,(1-\bar\alpha_t)\mathbf{I})$,</p>
<p>$$\sqrt{\bar{\alpha}_t}\,x_0 = x_t + (1-\bar{\alpha}_t)\,\nabla_{x_t}\log q(x_t).$$</p>
<p>Substituting $x_t=\sqrt{\bar\alpha_t}x_0+\sqrt{1-\bar\alpha_t}\,\epsilon$ and solving,</p>
<p>$$\nabla_{x_t}\log q(x_t) = -\frac{\epsilon}{\sqrt{1-\bar{\alpha}_t}}.$$</p>
<p>So the score and the noise are the same vector up to the fixed factor $-1/\sqrt{1-\bar\alpha_t}$. An error $\delta$ in the noise is an error $-\delta/\sqrt{1-\bar\alpha_t}$ in the score; squaring introduces exactly the factor $(1-\bar\alpha_t)$ that separates the weights in (b) and (c). <span class="qed"></span></p>
</div>

<figure>
<svg viewBox="0 0 700 250" role="img" aria-label="Triangle showing the three equivalent parameterisations">
<g font-family="Inter, system-ui, sans-serif" font-size="13">
<rect x="252" y="16" width="196" height="46" rx="11" fill="var(--surf2)" stroke="var(--p)" stroke-opacity=".55"/>
<text x="350" y="38" text-anchor="middle" fill="currentColor" font-weight="600">predict the image</text>
<text x="350" y="54" text-anchor="middle" fill="currentColor" fill-opacity=".62" font-family="ui-monospace,monospace" font-size="12">x̂_θ(x_t, t) ≈ x₀</text>
<rect x="34" y="176" width="196" height="46" rx="11" fill="var(--surf2)" stroke="var(--a)" stroke-opacity=".55"/>
<text x="132" y="198" text-anchor="middle" fill="currentColor" font-weight="600">predict the noise</text>
<text x="132" y="214" text-anchor="middle" fill="currentColor" fill-opacity=".62" font-family="ui-monospace,monospace" font-size="12">ε̂_θ(x_t, t) ≈ ε</text>
<rect x="470" y="176" width="196" height="46" rx="11" fill="var(--surf2)" stroke="var(--s)" stroke-opacity=".55"/>
<text x="568" y="198" text-anchor="middle" fill="currentColor" font-weight="600">predict the score</text>
<text x="568" y="214" text-anchor="middle" fill="currentColor" fill-opacity=".62" font-family="ui-monospace,monospace" font-size="12">s_θ(x_t,t) ≈ ∇log q(x_t)</text>
<g stroke="currentColor" stroke-opacity=".35" fill="none">
<path d="M262 66 L150 172"/><path d="M438 66 L550 172"/><path d="M232 199 L466 199"/>
</g>
<g font-family="ui-monospace, monospace" font-size="11.5" fill="currentColor" fill-opacity=".72">
<text x="106" y="122" text-anchor="middle">x₀ = (x_t − √(1−ᾱ)ε)/√ᾱ</text>
<text x="596" y="122" text-anchor="middle">Tweedie's formula</text>
<text x="349" y="192" text-anchor="middle" fill="var(--a)">s = −ε / √(1−ᾱ_t)</text>
</g>
<text x="350" y="240" text-anchor="middle" fill="currentColor" fill-opacity=".62" font-size="12">every edge is an exact, deterministic change of variable — not an approximation</text>
</g>
</svg>
<figcaption>The three heads a diffusion network can wear. Because the edges are exact linear rearrangements, a model trained on one is a model trained on all three; the choice is about optimisation, not about what gets learned.</figcaption>
</figure>

<div class="aside">
<strong>So why does everyone predict $\epsilon$?</strong> Not for any deep reason — the objectives
are provably the same. It is empirical: $\epsilon$ has the same scale, $\mathcal{N}(0,\mathbf{I})$,
at every timestep, whereas the $x_0$ and score targets have magnitudes that vary enormously
with $t$, which makes the loss badly conditioned across the timestep range. Predicting
$\epsilon$ is the parameterisation whose targets are already normalised.
</div>

### The loss that is actually used

Dropping the leading weight in (b) — which over-weights small $t$, where there is very little
signal to recover — gives the objective everyone trains:

$$L_{\text{simple}} = \mathbb{E}_{t,x_0,\epsilon}\left[\left\|\epsilon - \hat\epsilon_\theta\!\left(\sqrt{\bar{\alpha}_t}x_0+\sqrt{1-\bar{\alpha}_t}\epsilon,\ t\right)\right\|^2\right].$$

<div class="duo">
<figure>
<svg viewBox="0 0 340 190" role="img" aria-label="Training loop pseudocode">
<g font-family="ui-monospace, monospace" font-size="12.5">
<text x="14" y="22" fill="var(--p)" font-size="11" letter-spacing="1.4">TRAINING</text>
<text x="14" y="48" fill="currentColor">repeat</text>
<text x="30" y="70" fill="currentColor">x₀ ~ q(x₀)</text>
<text x="30" y="92" fill="currentColor">t  ~ Uniform{1…T}</text>
<text x="30" y="114" fill="currentColor">ε  ~ N(0, I)</text>
<text x="30" y="136" fill="currentColor">x_t = √ᾱ_t x₀ + √(1−ᾱ_t) ε</text>
<text x="30" y="158" fill="var(--a)">step on ∇‖ε − ε̂_θ(x_t,t)‖²</text>
<text x="14" y="180" fill="currentColor">until converged</text>
</g>
</svg>
<figcaption>No chain is ever simulated. Theorem 1 does all the work on line 4.</figcaption>
</figure>
<figure>
<svg viewBox="0 0 340 190" role="img" aria-label="Sampling loop pseudocode">
<g font-family="ui-monospace, monospace" font-size="12.5">
<text x="14" y="22" fill="var(--p)" font-size="11" letter-spacing="1.4">SAMPLING</text>
<text x="14" y="48" fill="currentColor">x_T ~ N(0, I)</text>
<text x="14" y="70" fill="currentColor">for t = T … 1:</text>
<text x="30" y="92" fill="currentColor">z ~ N(0,I) if t&gt;1 else 0</text>
<text x="30" y="118" fill="var(--a)">x_(t−1) = (x_t − β_t/√(1−ᾱ_t)·ε̂_θ)</text>
<text x="58" y="136" fill="var(--a)">/√α_t + σ_t z</text>
<text x="14" y="164" fill="currentColor">return x₀</text>
</g>
</svg>
<figcaption>T sequential network calls — the real cost, and the target of every fast-sampling paper.</figcaption>
</figure>
</div>

## A worked example, with real numbers

One dimension, five steps, a deliberately aggressive schedule so the numbers move visibly:

$$\beta = [0.1,\ 0.2,\ 0.3,\ 0.4,\ 0.5], \qquad x_0 = 2.0.$$

| t | βₜ | αₜ | ᾱₜ | √ᾱₜ | √(1−ᾱₜ) |
|---|-----|-----|-----|------|----------|
| 1 | 0.1 | 0.9 | 0.900000 | 0.948683 | 0.316228 |
| 2 | 0.2 | 0.8 | 0.720000 | 0.848528 | 0.529150 |
| 3 | 0.3 | 0.7 | 0.504000 | 0.709930 | 0.704273 |
| 4 | 0.4 | 0.6 | 0.302400 | 0.549909 | 0.835225 |
| 5 | 0.5 | 0.5 | 0.151200 | 0.388844 | 0.921303 |

Read the last two columns as a mixing ratio: at $t=1$ the sample is 94.9% signal and 31.6%
noise; by $t=5$ it is 38.9% signal and 92.1% noise. The coefficients cross between $t=2$ and
$t=3$ — that is where the sample stops being mostly signal.

<figure>
<svg viewBox="0 0 700 220" role="img" aria-label="Signal and noise coefficients across the five steps">
<g font-family="ui-monospace, monospace" font-size="11">
<line x1="56" y1="176" x2="668" y2="176" stroke="currentColor" stroke-opacity=".3"/>
<line x1="56" y1="36" x2="56" y2="176" stroke="currentColor" stroke-opacity=".3"/>
<text x="46" y="180" text-anchor="end" fill="currentColor" fill-opacity=".55">0</text>
<text x="46" y="40" text-anchor="end" fill="currentColor" fill-opacity=".55">1</text>
<rect x="86"  y="43.2"  width="34" height="132.8" fill="var(--p)" fill-opacity=".75"/><rect x="124" y="131.7" width="34" height="44.3"  fill="var(--a)" fill-opacity=".55"/>
<rect x="204" y="57.2"  width="34" height="118.8" fill="var(--p)" fill-opacity=".75"/><rect x="242" y="102.9" width="34" height="73.1"  fill="var(--a)" fill-opacity=".55"/>
<rect x="322" y="76.6"  width="34" height="99.4"  fill="var(--p)" fill-opacity=".75"/><rect x="360" y="77.4"  width="34" height="98.6"  fill="var(--a)" fill-opacity=".55"/>
<rect x="440" y="99.0"  width="34" height="77.0"  fill="var(--p)" fill-opacity=".75"/><rect x="478" y="59.1"  width="34" height="116.9" fill="var(--a)" fill-opacity=".55"/>
<rect x="558" y="121.6" width="34" height="54.4"  fill="var(--p)" fill-opacity=".75"/><rect x="596" y="46.0"  width="34" height="130.0" fill="var(--a)" fill-opacity=".55"/>
<g fill="currentColor" fill-opacity=".6" text-anchor="middle">
<text x="122" y="194">t=1</text><text x="240" y="194">t=2</text><text x="358" y="194">t=3</text><text x="476" y="194">t=4</text><text x="594" y="194">t=5</text>
</g>
<rect x="330" y="16" width="11" height="11" fill="var(--p)" fill-opacity=".75"/><text x="348" y="26" fill="currentColor" fill-opacity=".7">√ᾱ_t  signal</text>
<rect x="470" y="16" width="11" height="11" fill="var(--a)" fill-opacity=".55"/><text x="488" y="26" fill="currentColor" fill-opacity=".7">√(1−ᾱ_t)  noise</text>
</g>
</svg>
<figcaption>Signal and noise coefficients, drawn from the table above. Their crossing point is the useful part of the schedule.</figcaption>
</figure>

### One forward jump

Take $t=3$ and a single draw $\epsilon = 0.5$. Theorem 1 gives $x_3$ with no simulation of
steps 1 and 2:

$$x_3 = 0.709930 \times 2.0 + 0.704273 \times 0.5 = 1.419859 + 0.352136 = \mathbf{1.771995}.$$

The same $\epsilon$ at $t=2$ would give $x_2 = 1.961631$. Hold on to that number.

### The posterior at t = 3

Theorem 2's coefficients:

$$\begin{aligned}
\frac{\sqrt{\bar{\alpha}_2}\,\beta_3}{1-\bar{\alpha}_3} &= \frac{0.848528 \times 0.3}{0.496} = 0.513223, \\[6pt]
\frac{\sqrt{\alpha_3}\,(1-\bar{\alpha}_2)}{1-\bar{\alpha}_3} &= \frac{0.836660 \times 0.28}{0.496} = 0.472308.
\end{aligned}$$

They sum to $0.985531$, not 1 — a weighted combination, not an interpolation, exactly as the
theorem says. Then

$$\tilde{\mu}_3 = 0.513223 \times 2.0 + 0.472308 \times 1.771995 = \mathbf{1.863373},$$

$$\tilde{\beta}_3 = \frac{0.28}{0.496}\times 0.3 = 0.169355, \qquad \tilde{\sigma}_3 = 0.411527.$$

<figure>
<svg viewBox="0 0 700 152" role="img" aria-label="Number line showing x3, the posterior mean and the actual x2">
<g font-family="ui-monospace, monospace" font-size="11.5">
<rect x="366" y="60" width="62" height="28" fill="var(--a)" fill-opacity=".16"/>
<text x="397" y="52" text-anchor="middle" fill="var(--a)" font-size="10.5">μ̃₃ ± σ̃₃</text>
<line x1="60" y1="88" x2="660" y2="88" stroke="currentColor" stroke-opacity=".4"/>
<g stroke="currentColor" stroke-opacity=".3">
<line x1="60"  y1="84" x2="60"  y2="92"/><line x1="210" y1="84" x2="210" y2="92"/>
<line x1="360" y1="84" x2="360" y2="92"/><line x1="510" y1="84" x2="510" y2="92"/>
<line x1="660" y1="84" x2="660" y2="92"/>
</g>
<g fill="currentColor" fill-opacity=".5" text-anchor="middle" font-size="10.5">
<text x="60" y="106">1.4</text><text x="210" y="106">1.6</text><text x="360" y="106">1.8</text><text x="510" y="106">2.0</text><text x="660" y="106">2.2</text>
</g>
<g stroke-width="2">
<line x1="339" y1="68" x2="339" y2="108" stroke="var(--p)"/>
<line x1="397" y1="68" x2="397" y2="108" stroke="var(--a)"/>
<line x1="571" y1="68" x2="571" y2="108" stroke="var(--s)"/>
</g>
<text x="300" y="126" text-anchor="middle" fill="var(--p)">x₃ = 1.7720</text>
<text x="430" y="144" text-anchor="middle" fill="var(--a)">μ̃₃ = 1.8634</text>
<text x="571" y="126" text-anchor="middle" fill="var(--s)">actual x₂ = 1.9616</text>
<text x="60" y="24" fill="currentColor" fill-opacity=".72" font-size="12">One reverse step at t = 3: where the posterior puts x₂, and where x₂ actually was</text>
</g>
</svg>
<figcaption>The gap between μ̃₃ and the true x₂ is 0.098 — about 0.24 of the posterior's own standard deviation. The posterior is not wrong; it is a distribution, and the true value sits comfortably inside it.</figcaption>
</figure>

### All three parameterisations, on this frame

This is the numerical payoff of Theorem 5. At $t=3$, with $x_3=1.771995$ and $\epsilon=0.5$:

**The score.** By Tweedie, $\nabla\log q(x_3) = -0.5/0.704273 = -0.709952$. Check that the
formula itself holds:

$$x_3 + (1-\bar\alpha_3)\nabla\log q(x_3) = 1.771995 + 0.496\times(-0.709952) = 1.419859 = \sqrt{\bar\alpha_3}\,x_0. \;\checkmark$$

**The image.** $\hat{x}_0 = (1.771995 - 0.704273\times 0.5)/0.709930 = 2.000000$, recovering
$x_0$ exactly, as it must.

**The same mean, three ways.**

| route | formula | value |
|-------|---------|-------|
| via x₀ | 0.513223·x̂₀ + 0.472308·x₃ | 1.863373 |
| via ε | (x₃ − 0.3/0.704273·ε) / √0.7 | 1.863373 |
| via score | (x₃ + 0.3·s) / √0.7 | 1.863373 |

**And the same loss.** Suppose the model is wrong by $\delta=0.5$ in the noise. Theorem 5 says
that error is a fixed multiple of the corresponding errors in the other two targets, and that
the weights compensate exactly:

| target | weight at t=3 | error | weighted loss |
|--------|---------------|-------|---------------|
| x₀ | 0.777650 | −0.496016 | **0.191327** |
| ε | 0.765306 | +0.500000 | **0.191327** |
| score | 0.379592 | −0.709952 | **0.191327** |

Three objectives, three different weights, three different error magnitudes — one number.
That identity is Theorem 5 made arithmetic, and it is why the literature moves between
"denoiser", "noise predictor" and "score model" without ever changing what is being learned.

### What a prediction error costs

The reverse mean the model produces is $\mu(\hat\epsilon)=2.117940-0.509133\,\hat\epsilon$, so
the error in the mean is exactly $0.509133\,(\epsilon-\hat\epsilon)$ — **linear** in the noise
error, with a factor fixed by the schedule:

| ε̂ | ‖ε−ε̂‖² | resulting μ | error in μ | weighted L₂ |
|-----|---------|-------------|------------|-------------|
| 0.50 | 0.0000 | 1.863373 | 0.000000 | 0.0000 |
| 0.20 | 0.0900 | 2.016113 | +0.152740 | 0.0689 |
| 0.00 | 0.2500 | 2.117940 | +0.254567 | 0.1913 |
| −0.30 | 0.6400 | 2.270680 | +0.407307 | 0.4898 |

Because the weight is constant at each $t$, dropping it — as $L_{\text{simple}}$ does — changes
only the relative emphasis *across* timesteps, never the location of the optimum *at* a
timestep. That is the licence for training on plain mean squared error.

### An experiment on the noise term

The sampler adds $\sigma_t z$ because the posterior is a distribution, not a point. That is the
correct reading of the derivation, but it is worth asking what actually breaks if you drop it.
I ran the toy chain both ways, 200,000 samples each, on a two-point data distribution
$x_0\in\{-2,+2\}$ with a Bayes-optimal denoiser:

| sampler | mean | sd | P(x > 0) | fraction within 0.5 of a mode |
|---------|------|-----|----------|-------------------------------|
| with σₜz | +0.005 | 1.999 | 0.501 | 0.999 |
| mean only | −0.000 | 1.999 | 0.500 | 0.999 |

**Indistinguishable.** I expected the deterministic version to collapse, and it does not. The
honest conclusion is that with an *exact* denoiser the deterministic map is a valid transport
too — which is precisely why DDIM works and why few-step samplers are deterministic. The
stochastic step is what the ELBO derivation licenses, not what sample quality depends on. At
scale, stochastic sampling does help, but as error correction under an imperfect model, not
because the mean-only chain is degenerate.

### Where this toy chain is dishonest

$\sqrt{\bar\alpha_5}=0.389$: after all five steps, $x_5$ still carries 39% of the original
signal. Starting the reverse chain from $\mathcal{N}(0,1)$ would begin from a distribution that
does not match $q(x_5)$, and the samples would be biased. The five-step chain exists for
arithmetic you can check by hand, not for generating anything.

## Schedules: where the chain spends its steps

Real DDPM uses $T=1000$ with $\beta$ linear from $10^{-4}$ to $0.02$, giving
$\bar\alpha_T\approx 4.0\times10^{-5}$ and $\sqrt{\bar\alpha_T}\approx 0.0064$ — the residual
signal genuinely is negligible and starting from pure noise is sound.

But *where* the destruction happens matters as much as whether it finishes. Improved DDPM
observed that the linear schedule ruins the image far too early, and proposed

$$\bar{\alpha}_t = \frac{f(t)}{f(0)}, \qquad f(t)=\cos^2\!\left(\frac{t/T+s}{1+s}\cdot\frac{\pi}{2}\right), \qquad s = 0.008,$$

with the offset $s$ chosen so that $\sqrt{\beta_0}$ sits just below the pixel bin size
$1/127.5$. Plotting both makes the argument immediately:

<figure>
<svg viewBox="0 0 700 210" role="img" aria-label="Linear versus cosine noise schedules">
<g font-family="ui-monospace, monospace" font-size="11">
<g stroke="currentColor" stroke-opacity=".14">
<line x1="60" y1="30" x2="660" y2="30"/><line x1="60" y1="65" x2="660" y2="65"/>
<line x1="60" y1="100" x2="660" y2="100"/><line x1="60" y1="135" x2="660" y2="135"/>
</g>
<line x1="60" y1="170" x2="660" y2="170" stroke="currentColor" stroke-opacity=".4"/>
<line x1="60" y1="26" x2="60" y2="170" stroke="currentColor" stroke-opacity=".4"/>
<g fill="currentColor" fill-opacity=".55" text-anchor="end">
<text x="52" y="34">1.0</text><text x="52" y="104">0.5</text><text x="52" y="174">0.0</text>
</g>
<g fill="currentColor" fill-opacity=".55" text-anchor="middle">
<text x="60" y="190">0</text><text x="360" y="190">T/2</text><text x="660" y="190">T</text>
</g>
<polyline fill="none" stroke="var(--s)" stroke-width="2" points="60.0,30.0 70.0,30.6 80.0,32.0 90.0,34.1 100.0,36.9 110.0,40.5 120.0,44.4 130.0,49.1 140.0,54.4 150.0,59.6 160.0,65.6 170.0,71.8 180.0,77.7 190.0,84.2 200.0,90.6 210.0,96.6 220.0,102.9 230.0,109.0 240.0,114.5 250.0,120.1 260.0,125.4 270.0,130.1 280.0,134.7 290.0,138.7 300.0,142.7 310.0,146.3 320.0,149.3 330.0,152.2 340.0,154.8 350.0,157.0 360.0,159.0 370.0,160.8 380.0,162.2 390.0,163.5 400.0,164.7 410.0,165.6 420.0,166.4 430.0,167.1 440.0,167.6 450.0,168.1 460.0,168.5 470.0,168.8 480.0,169.0 490.0,169.2 500.0,169.4 510.0,169.5 520.0,169.6 530.0,169.7 540.0,169.8 550.0,169.8 560.0,169.9 570.0,169.9 580.0,169.9 590.0,169.9 600.0,170.0 610.0,170.0 620.0,170.0 630.0,170.0 640.0,170.0 650.0,170.0 660.0,170.0"/>
<polyline fill="none" stroke="var(--p)" stroke-width="2" points="60.0,30.0 70.0,30.2 80.0,30.6 90.0,31.1 100.0,31.9 110.0,32.8 120.0,33.9 130.0,35.2 140.0,36.7 150.0,38.3 160.0,40.1 170.0,42.1 180.0,44.2 190.0,46.5 200.0,49.0 210.0,51.4 220.0,54.2 230.0,57.0 240.0,59.8 250.0,62.9 260.0,66.1 270.0,69.2 280.0,72.6 290.0,75.8 300.0,79.4 310.0,82.9 320.0,86.3 330.0,90.0 340.0,93.7 350.0,97.2 360.0,100.9 370.0,104.6 380.0,108.0 390.0,111.7 400.0,115.4 410.0,118.7 420.0,122.3 430.0,125.8 440.0,129.0 450.0,132.3 460.0,135.6 470.0,138.5 480.0,141.6 490.0,144.3 500.0,147.1 510.0,149.8 520.0,152.2 530.0,154.6 540.0,156.8 550.0,158.8 560.0,160.7 570.0,162.5 580.0,164.0 590.0,165.4 600.0,166.6 610.0,167.6 620.0,168.5 630.0,169.2 640.0,169.6 650.0,169.9 660.0,170.0"/>
<circle cx="216" cy="100" r="3.5" fill="var(--s)"/><circle cx="358" cy="100" r="3.5" fill="var(--p)"/>
<text x="216" y="120" text-anchor="middle" fill="var(--s)" font-size="10.5">t/T = 0.26</text>
<text x="368" y="120" text-anchor="middle" fill="var(--p)" font-size="10.5">t/T = 0.50</text>
<rect x="420" y="24" width="11" height="3" fill="var(--s)"/><text x="438" y="28" fill="currentColor" fill-opacity=".72">linear</text>
<rect x="500" y="24" width="11" height="3" fill="var(--p)"/><text x="518" y="28" fill="currentColor" fill-opacity=".72">cosine (s = 0.008)</text>
<text x="60" y="16" fill="currentColor" fill-opacity=".72" font-size="12">ᾱ_t against t/T,  T = 1000</text>
</g>
</svg>
<figcaption>The dots mark where each schedule reaches ᾱ = 0.5. Linear gets there a quarter of the way through and is already at ᾱ = 0.026 by t/T = 0.6 — the last 40% of its chain operates on what is effectively pure noise, learning almost nothing.</figcaption>
</figure>

| t/T | ᾱₜ linear | ᾱₜ cosine |
|-----|-----------|-----------|
| 0.10 | 0.89514 | 0.97158 |
| 0.25 | 0.52142 | 0.84589 |
| 0.50 | 0.07780 | 0.49229 |
| 0.75 | 0.00330 | 0.14318 |
| 0.90 | 0.00027 | 0.02362 |

The same paper also learns the variance back, interpolating in log space between the two
natural bounds $\beta_t$ and $\tilde\beta_t$:

$$\Sigma_\theta(x_t,t) = \exp\!\big(v\log\beta_t + (1-v)\log\tilde\beta_t\big),$$

trained with $L_{\text{hybrid}} = L_{\text{simple}} + \lambda L_{\text{vlb}}$ at
$\lambda = 0.001$ — small enough that the VLB term shapes the variance without destabilising
the mean. The practical payoff is not likelihood but **speed**: with learned variances, 100
sampling steps reach FID ≈ 22 and 250 steps reach the full-quality 19.2, against 4000 for the
fixed-variance model.

<figure>
<svg viewBox="0 0 700 200" role="img" aria-label="FID against number of sampling steps">
<g font-family="ui-monospace, monospace" font-size="11">
<line x1="70" y1="156" x2="660" y2="156" stroke="currentColor" stroke-opacity=".4"/>
<line x1="70" y1="22" x2="70" y2="156" stroke="currentColor" stroke-opacity=".4"/>
<g stroke="currentColor" stroke-opacity=".13">
<line x1="70" y1="47.7" x2="660" y2="47.7"/><line x1="70" y1="101.8" x2="660" y2="101.8"/>
</g>
<g fill="currentColor" fill-opacity=".55" text-anchor="end">
<text x="62" y="51">20</text><text x="62" y="105">25</text><text x="62" y="160">30</text>
</g>
<polyline fill="none" stroke="var(--a)" stroke-width="2" points="70.0,134.3 155.4,69.3 268.3,39.0 439.2,39.0 610.0,39.0"/>
<g fill="var(--a)">
<circle cx="70" cy="134.3" r="4"/><circle cx="155.4" cy="69.3" r="4"/><circle cx="268.3" cy="39" r="4"/>
<circle cx="439.2" cy="39" r="4"/><circle cx="610" cy="39" r="4"/>
</g>
<g fill="currentColor" fill-opacity=".6" text-anchor="middle">
<text x="70" y="174">50</text><text x="155" y="174">100</text><text x="268" y="174">250</text><text x="439" y="174">1000</text><text x="610" y="174">4000</text>
</g>
<text x="360" y="192" text-anchor="middle" fill="currentColor" fill-opacity=".55">sampling steps (log scale)</text>
<text x="70" y="14" fill="currentColor" fill-opacity=".72" font-size="12">FID vs sampling steps — ImageNet 64×64, learned variances</text>
<text x="300" y="30" fill="currentColor" fill-opacity=".5" font-size="10.5">flat from 250 steps onward</text>
</g>
</svg>
<figcaption>Below about 100 steps costs quality; above 250 buys none. The whole fast-sampling literature is about moving that knee to the left.</figcaption>
</figure>

## Guidance

An unconditional model samples from $q(x)$. To sample from $q(x\mid y)$ — this class, this
caption — apply Bayes to the *score*:

$$\nabla_{x_t}\log q(x_t\mid y) = \nabla_{x_t}\log q(x_t) + \nabla_{x_t}\log q(y\mid x_t).$$

**Classifier guidance** estimates the second term with a classifier trained on noisy inputs
and shifts the sampling mean by its gradient:

$$x_{t-1}\sim\mathcal{N}\!\left(\mu_\theta(x_t,t) + s\,\Sigma_\theta\nabla_{x_t}\log p_\phi(y\mid x_t),\ \Sigma_\theta\right).$$

The scale $s$ is not cosmetic. At $s=1$ the classifier's confidence on generated samples stays
low; scaling it up sharpens the conditional mode and, in the ADM paper, pushed class
probabilities to nearly 100%. The values used rise steeply with resolution — 0.5 at 128×128,
1.0 at 256×256, 4.0 at 512×512 for 250-step sampling, and higher again for 25-step DDIM.

**Classifier-free guidance** removes the separate classifier entirely. Train one conditional
model with the conditioning dropped out some fraction of the time, so the same network can be
queried both ways, then combine:

$$\tilde\epsilon = (1+w)\,\hat\epsilon_\theta(x_t,t,y) - w\,\hat\epsilon_\theta(x_t,t,\varnothing).$$

Same rearrangement, one model playing both roles. It is what every current text-to-image
system uses.

## What the papers actually report

Numbers, so the progression is concrete rather than rhetorical.

| model | CIFAR-10 FID | CIFAR-10 NLL | ImageNet 64 FID | ImageNet 64 NLL |
|-------|--------------|--------------|-----------------|-----------------|
| DDPM (2020) | 3.29 | 3.73 | 31.3 | 3.77 |
| Improved DDPM (2021) | 3.19 | **2.94** | **19.2** | **3.53** |

The likelihood improvement is the larger result: cosine schedule plus learned variances took
CIFAR-10 from 3.73 to 2.94 bits/dim. Sample quality came next, from architecture and guidance.

<figure>
<svg viewBox="0 0 700 216" role="img" aria-label="ImageNet FID, BigGAN-deep versus guided diffusion">
<g font-family="ui-monospace, monospace" font-size="11">
<g stroke="currentColor" stroke-opacity=".13">
<line x1="70" y1="30" x2="640" y2="30"/><line x1="70" y1="80" x2="640" y2="80"/><line x1="70" y1="130" x2="640" y2="130"/>
</g>
<line x1="70" y1="180" x2="640" y2="180" stroke="currentColor" stroke-opacity=".4"/>
<g fill="currentColor" fill-opacity=".55" text-anchor="end">
<text x="62" y="34">9</text><text x="62" y="84">6</text><text x="62" y="134">3</text><text x="62" y="184">0</text>
</g>
<rect x="117" y="79.7" width="42" height="100.3" fill="currentColor" fill-opacity=".26"/>
<rect x="165" y="130.5" width="42" height="49.5" fill="var(--p)" fill-opacity=".85"/>
<rect x="304" y="64.2" width="42" height="115.8" fill="currentColor" fill-opacity=".26"/>
<rect x="352" y="103.5" width="42" height="76.5" fill="var(--p)" fill-opacity=".85"/>
<rect x="491" y="39.5" width="42" height="140.5" fill="currentColor" fill-opacity=".26"/>
<rect x="539" y="51.3" width="42" height="128.7" fill="var(--p)" fill-opacity=".85"/>
<g fill="currentColor" fill-opacity=".85" text-anchor="middle" font-size="10.5">
<text x="138" y="74">6.02</text><text x="186" y="125">2.97</text>
<text x="325" y="58">6.95</text><text x="373" y="98">4.59</text>
<text x="512" y="34">8.43</text><text x="560" y="46">7.72</text>
</g>
<g fill="currentColor" fill-opacity=".6" text-anchor="middle">
<text x="163" y="198">128×128</text><text x="350" y="198">256×256</text><text x="537" y="198">512×512</text>
</g>
<rect x="330" y="10" width="11" height="11" fill="currentColor" fill-opacity=".26"/><text x="348" y="20" fill="currentColor" fill-opacity=".7">BigGAN-deep</text>
<rect x="470" y="10" width="11" height="11" fill="var(--p)" fill-opacity=".85"/><text x="488" y="20" fill="currentColor" fill-opacity=".7">guided diffusion (ADM-G)</text>
<text x="70" y="20" fill="currentColor" fill-opacity=".72" font-size="12">ImageNet FID — lower is better</text>
</g>
</svg>
<figcaption>The result the 2021 paper is named for. The margin narrows sharply with resolution: convincing at 128×128, marginal at 512×512.</figcaption>
</figure>

The architecture changes behind it are worth listing, because none of them appear in the maths
above and all of them mattered: attention at 32×32, 16×16 **and** 8×8 rather than 16×16 alone;
more attention heads at 64 channels each; BigGAN-style residual blocks for up- and
down-sampling; and adaptive group normalisation,
$\text{AdaGN}(h,y)=y_s\,\text{GroupNorm}(h)+y_b$, for injecting the timestep and class
embeddings. On LSUN, unconditional diffusion also beat StyleGAN2 — bedrooms 1.90 vs 2.35,
horses 2.57 vs 3.84, cats 5.57 vs 7.25.

## What actually matters in practice

- **The schedule is a design decision, not a detail.** The graph above is the whole argument
  for cosine: linear is not wrong, it wastes 40% of its chain.
- **Conditioning on $t$ is essential.** One network covers every noise level, so $t$ enters
  through a sinusoidal embedding at every block. Without it the model cannot know how much
  noise to remove.
- **Predicting $\epsilon$ is a conditioning choice, not a mathematical one.** Theorem 5 says
  the three targets are the same; $\epsilon$ wins because its scale is constant in $t$.
- **The real cost is $T$ sequential network calls.** DDIM reformulates sampling as a
  non-Markovian deterministic process and reaches comparable images in 20–50 steps, reusing
  the same $\hat\epsilon_\theta$ with no retraining.
- **Guidance is where the sample quality actually came from.** The 2021 FID numbers are a
  guidance-and-architecture result at least as much as a diffusion result.

## References

- Sohl-Dickstein, Weiss, Maheswaranathan, Ganguli, *[Deep Unsupervised Learning using Nonequilibrium Thermodynamics](https://arxiv.org/abs/1503.03585)* (2015) — the original construction and the physics argument.
- Ho, Jain, Abbeel, *[Denoising Diffusion Probabilistic Models](https://arxiv.org/abs/2006.11239)* (2020) — $L_{\text{simple}}$ and the modern formulation.
- Nichol & Dhariwal, *[Improved Denoising Diffusion Probabilistic Models](https://arxiv.org/abs/2102.09672)* (2021) — cosine schedule, learned variances, the step-count result.
- Dhariwal & Nichol, *[Diffusion Models Beat GANs on Image Synthesis](https://arxiv.org/abs/2105.05233)* (2021) — architecture ablations and classifier guidance.
- Luo, *[Understanding Diffusion Models: A Unified Perspective](https://arxiv.org/abs/2208.11970)* (2022) — the three-parameterisation equivalence, presented in full.
- Song, Meng, Ermon, *[Denoising Diffusion Implicit Models](https://arxiv.org/abs/2010.02502)* (2021) — deterministic few-step sampling.

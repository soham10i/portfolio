import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Mail, MapPin, Send, Github, Linkedin } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export default function Contact() {
  const sectionRef = useRef<HTMLElement>(null);
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.contact-heading', { y: 60, opacity: 0 }, {
        y: 0, opacity: 1, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: '.contact-heading', start: 'top 85%', toggleActions: 'play none none none' },
      });
      gsap.fromTo('.contact-info', { y: 40, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.8, ease: 'power3.out',
        scrollTrigger: { trigger: '.contact-info', start: 'top 85%', toggleActions: 'play none none none' },
      });
      gsap.fromTo('.contact-form', { y: 40, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.8, delay: 0.15, ease: 'power3.out',
        scrollTrigger: { trigger: '.contact-form', start: 'top 85%', toggleActions: 'play none none none' },
      });
    }, section);
    return () => ctx.revert();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 1500));
    setIsSubmitting(false);
    setSubmitted(true);
    setFormData({ name: '', email: '', message: '' });
    setTimeout(() => setSubmitted(false), 5000);
  };

  return (
    <section id="contact" ref={sectionRef} className="relative py-32 sm:py-48">
      <div className="mx-auto max-w-6xl px-6">
        <div className="contact-heading">
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-6">Contact</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight leading-[1.1] max-w-2xl mb-20">
            Let's <span className="text-gradient">talk</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
          <div className="contact-info space-y-10">
            <div className="space-y-6">
              {[
                { icon: Mail, label: 'Email', value: 'soham.patel.2201@gmail.com', href: 'mailto:soham.patel.2201@gmail.com' },
                { icon: MapPin, label: 'Location', value: 'Amberg, Germany', href: '#' },
              ].map((item) => (
                <a key={item.label} href={item.href} className="flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-xl bg-muted/40 flex items-center justify-center group-hover:bg-foreground/5 transition-colors duration-300">
                    <item.icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                    <p className="text-sm font-medium">{item.value}</p>
                  </div>
                </a>
              ))}
            </div>

            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-4">Social</p>
              <div className="flex gap-3">
                {[
                  { icon: Github, label: 'GitHub', href: 'https://github.com/soham10i' },
                  { icon: Linkedin, label: 'LinkedIn', href: 'https://linkedin.com/in/soham10i' },
                ].map((social) => (
                  <a key={social.label} href={social.href} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-full border border-border/50 hover:bg-foreground hover:text-background transition-all duration-300">
                    <social.icon className="w-4 h-4" />{social.label}
                  </a>
                ))}
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 text-green-500 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Available for opportunities
            </div>
          </div>

          <form onSubmit={handleSubmit} className="contact-form space-y-5">
            {[
              { id: 'name', label: 'Name', type: 'text', placeholder: 'Your name' },
              { id: 'email', label: 'Email', type: 'email', placeholder: 'your@email.com' },
            ].map((field) => (
              <div key={field.id}>
                <label htmlFor={field.id} className="block text-[10px] text-muted-foreground mb-2 uppercase tracking-[0.2em]">{field.label}</label>
                <input
                  type={field.type}
                  id={field.id}
                  value={(formData as Record<string, string>)[field.id]}
                  onChange={(e) => setFormData({ ...formData, [field.id]: e.target.value })}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-muted/20 border border-border/40 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 transition-colors text-sm"
                  placeholder={field.placeholder}
                />
              </div>
            ))}
            <div>
              <label htmlFor="message" className="block text-[10px] text-muted-foreground mb-2 uppercase tracking-[0.2em]">Message</label>
              <textarea
                id="message"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                required
                rows={5}
                className="w-full px-4 py-3 rounded-xl bg-muted/20 border border-border/40 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 transition-colors text-sm resize-none"
                placeholder="Tell me about your project..."
              />
            </div>
            <button type="submit" disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-foreground text-background font-medium rounded-xl hover:bg-foreground/85 transition-all disabled:opacity-50 text-sm">
              {isSubmitting ? (
                <span className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
              ) : submitted ? (
                'Message sent ✓'
              ) : (
                <><Send className="w-4 h-4" />Send Message</>
              )}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

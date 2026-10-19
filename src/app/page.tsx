import Link from "next/link";
import { Brand, Icon } from "@/components/icon";
export default function Home() {
  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Main navigation">
        <Link href="/" aria-label="RemindMe home">
          <Brand />
        </Link>
        <div>
          <Link href="/login">Sign in</Link>
          <Link href="/register" className="button button-dark">
            Make a little space <Icon name="arrow" size={15} />
          </Link>
        </div>
      </nav>
      <section className="landing-hero">
        <div>
          <p className="eyebrow">FOR THE LITTLE THINGS. AND THE BIG ONES.</p>
          <h1>
            A little less <br />
            to keep in <br />
            <em>your head.</em>
          </h1>
          <p>
            Your ideas, your errands, that thing for tomorrow. Give them a home,
            and give yourself a little room to breathe.
          </p>
          <div className="landing-cta">
            <Link href="/register" className="button button-coral">
              Create account <Icon name="arrow" size={17} />
            </Link>
            <span>One thought at a time.</span>
          </div>
        </div>
        <div
          className="landing-illustration"
          aria-label="An example of a RemindMe reminder"
        >
          <span className="demo-floating">
            <Icon name="bell" size={30} />
          </span>
          <span className="demo-spark" aria-hidden="true">
            ✳
          </span>
          <div className="demo-reminder">
            <p className="eyebrow">A LITTLE EXAMPLE</p>
            <span className="pill today-pill">For tomorrow</span>
            <h3>
              Call someone
              <br />
              who makes you smile.
            </h3>
            <p>
              <Icon
                name="calendar"
                size={13}
                style={{ display: "inline", marginRight: 6 }}
              />
              Tomorrow, 3:00 PM
            </p>
            <small>
              <Icon name="check" size={13} />A little less on your mind.
            </small>
          </div>
          <div className="demo-voice">
            <Icon name="mic" size={18} />
            <span>Just say the word.</span>
            <span className="voice-bars" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>
      </section>
      <section className="landing-features" aria-label="Made for your everyday">
        <div>
          <Icon name="sparkle" size={24} />
          <h2>A thought, not a form.</h2>
          <p>
            Write it how you’d say it. We’ll help find the details, and you’ll
            make them yours before saving.
          </p>
        </div>
        <div>
          <Icon name="mic" size={24} />
          <h2>Say it. Set it down.</h2>
          <p>
            Speak a reminder in a supported browser. Review the words, fine-tune
            the details, and carry on.
          </p>
        </div>
        <div>
          <Icon name="check" size={24} />
          <h2>A little more headspace.</h2>
          <p>
            One calm place for your deadlines, your next little thing, and the
            satisfying things you’ve finished.
          </p>
        </div>
      </section>
      <footer className="landing-footer">
        <span>
          © {new Date().getFullYear()} RemindMe. Less remembering. More living.
        </span>
        <span>In development. Scheduled email delivery awaits activation.</span>
      </footer>
    </main>
  );
}

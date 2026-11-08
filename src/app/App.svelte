<script lang="ts">
  // 画面ルーター（オーケストレーター所有）
  import { screen, settings } from './store';
  import S01Title from './screens/S01Title.svelte';
  import S02Prologue from './screens/S02Prologue.svelte';
  import S03ScenarioSelect from './screens/S03ScenarioSelect.svelte';
  import S04RoleSelect from './screens/S04RoleSelect.svelte';
  import S05Main from './screens/S05Main.svelte';
  import S06Draft from './screens/S06Draft.svelte';
  import S07Press from './screens/S07Press.svelte';
  import S08Ending from './screens/S08Ending.svelte';
  import S09Review from './screens/S09Review.svelte';
  import S10Settings from './screens/S10Settings.svelte';
  import S11Credits from './screens/S11Credits.svelte';
  import ErrorScreen from './screens/ErrorScreen.svelte';

  const screens = { S01: S01Title, S02: S02Prologue, S03: S03ScenarioSelect, S04: S04RoleSelect, S05: S05Main,
    S06: S06Draft, S07: S07Press, S08: S08Ending, S09: S09Review, S10: S10Settings, S11: S11Credits, error: ErrorScreen };
  const Current = $derived(screens[$screen]);
</script>

<main class="app font-{$settings.fontSize}" class:reduce-motion={$settings.reduceMotion}>
  <Current />
</main>

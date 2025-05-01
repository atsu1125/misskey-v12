<template>
<component :is="self ? 'MkA' : 'a'" ref="el" class="xlcxczvw _link" :[attr]="maybeRelativeUrl" :rel="rel" :target="target"
	:title="url"
>
	<slot></slot>
	<i v-if="target === '_blank'" class="fas fa-external-link-square-alt icon"></i>
</component>
</template>

<script lang="ts" setup>
import { defineAsyncComponent } from 'vue';
import { url as local } from '@/config';
import { useTooltip } from '@/scripts/use-tooltip';
import * as os from '@/os';
import { maybeMakeRelative } from "@/scripts/url";

const props = withDefaults(defineProps<{
	url: string;
	rel?: null | string;
}>(), {
});

const maybeRelativeUrl = maybeMakeRelative(props.url, local);
const self = maybeRelativeUrl !== props.url;
const attr = self ? 'to' : 'href';
const target = self ? null : '_blank';

const el = $ref();

useTooltip($$(el), (showing) => {
	os.popup(defineAsyncComponent(() => import('@/components/MkUrlPreviewPopup.vue')), {
		showing,
		url: props.url,
		source: el,
	}, {}, 'closed');
});
</script>

<style lang="scss" scoped>
.xlcxczvw {
	word-break: break-all;

	> .icon {
		padding-left: 2px;
		font-size: .9em;
	}
}
</style>
